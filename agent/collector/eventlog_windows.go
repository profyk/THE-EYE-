//go:build windows

// Package collector subscribes to Windows Event Log channels and translates
// events into the THE EYE ledger event schema.
package collector

import (
	"encoding/xml"
	"fmt"
	"log"
	"os"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/profyk/the-eye-agent/config"
	"github.com/profyk/the-eye-agent/queue"
)

var (
	wevtapi            = windows.NewLazySystemDLL("wevtapi.dll")
	procEvtSubscribe   = wevtapi.NewProc("EvtSubscribe")
	procEvtNext        = wevtapi.NewProc("EvtNext")
	procEvtRender      = wevtapi.NewProc("EvtRender")
	procEvtClose       = wevtapi.NewProc("EvtClose")
)

const (
	evtSubscribeToFutureEvents = 1
	evtRenderEventXML          = 1
	evtNextTimeout             = 500 // ms
)

// subscription bundles a channel + XPath query.
type subscription struct {
	channel string
	query   string
}

var subscriptions = []subscription{
	{
		channel: "Security",
		query: "*[System[(EventID=4624 or EventID=4625 or EventID=4634 or" +
			" EventID=4647 or EventID=4673 or EventID=4688 or EventID=4720 or" +
			" EventID=4726 or EventID=4732 or EventID=4733 or EventID=5156)]]",
	},
	{
		channel: "System",
		query:   "*[System[(EventID=6005 or EventID=6006 or EventID=7045 or EventID=7036)]]",
	},
	{
		channel: "Microsoft-Windows-PowerShell/Operational",
		query:   "*[System[EventID=4104]]",
	},
}

// Collector subscribes to Windows Event Log and enqueues translated events.
type Collector struct {
	cfg  *config.Config
	q    *queue.Queue
	host string
}

// New returns a Collector. hostname lookup is best-effort.
func New(cfg *config.Config, q *queue.Queue) *Collector {
	h, _ := os.Hostname()
	return &Collector{cfg: cfg, q: q, host: h}
}

// Run starts all subscriptions. Blocks until the process exits.
func (c *Collector) Run() {
	for _, sub := range subscriptions {
		go c.runSubscription(sub)
	}
	select {} // block forever; goroutines are daemon threads
}

func (c *Collector) runSubscription(sub subscription) {
	channelPtr, err := syscall.UTF16PtrFromString(sub.channel)
	if err != nil {
		log.Printf("[collector] utf16 channel %s: %v", sub.channel, err)
		return
	}
	queryPtr, err := syscall.UTF16PtrFromString(sub.query)
	if err != nil {
		log.Printf("[collector] utf16 query %s: %v", sub.channel, err)
		return
	}

	hSub, _, syserr := procEvtSubscribe.Call(
		0,
		0,
		uintptr(unsafe.Pointer(channelPtr)),
		uintptr(unsafe.Pointer(queryPtr)),
		0, 0, 0,
		evtSubscribeToFutureEvents,
	)
	if hSub == 0 {
		log.Printf("[collector] EvtSubscribe %s failed: %v", sub.channel, syserr)
		return
	}
	defer procEvtClose.Call(hSub)

	log.Printf("[collector] subscribed to %s", sub.channel)

	const batchSize = 10
	var handles [batchSize]uintptr
	var returned uint32

	for {
		r, _, _ := procEvtNext.Call(
			hSub,
			batchSize,
			uintptr(unsafe.Pointer(&handles[0])),
			evtNextTimeout,
			0,
			uintptr(unsafe.Pointer(&returned)),
		)
		if r == 0 || returned == 0 {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		for i := uint32(0); i < returned; i++ {
			c.processHandle(handles[i])
			procEvtClose.Call(handles[i])
		}
	}
}

func (c *Collector) processHandle(h uintptr) {
	xmlStr, err := renderEventXML(h)
	if err != nil {
		return
	}
	ev := parseEventXML(xmlStr)
	if ev == nil {
		return
	}
	le := c.translate(ev, xmlStr)
	if le != nil {
		c.q.Enqueue(le)
	}
}

// renderEventXML calls EvtRender to produce the event XML string.
func renderEventXML(h uintptr) (string, error) {
	var bufSize, used, propCount uint32

	procEvtRender.Call(0, h, evtRenderEventXML, 0, 0,
		uintptr(unsafe.Pointer(&bufSize)),
		uintptr(unsafe.Pointer(&propCount)))

	if bufSize == 0 {
		return "", fmt.Errorf("EvtRender size=0")
	}

	buf := make([]uint16, bufSize/2+1)
	r, _, syserr := procEvtRender.Call(
		0, h, evtRenderEventXML,
		uintptr(bufSize),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&used)),
		uintptr(unsafe.Pointer(&propCount)),
	)
	if r == 0 {
		return "", fmt.Errorf("EvtRender: %v", syserr)
	}
	return windows.UTF16ToString(buf), nil
}

// ── XML structs ───────────────────────────────────────────────────────────────

type winEvent struct {
	System struct {
		ProviderName string `xml:"Provider>Name,attr"`
		EventID      int    `xml:"EventID"`
		TimeCreated  struct {
			SystemTime string `xml:"SystemTime,attr"`
		} `xml:"TimeCreated"`
		Computer string `xml:"Computer"`
		Channel  string `xml:"Channel"`
	} `xml:"System"`
	EventData struct {
		Data []struct {
			Name  string `xml:"Name,attr"`
			Value string `xml:",chardata"`
		} `xml:"Data"`
	} `xml:"EventData"`
}

func parseEventXML(raw string) *winEvent {
	var ev winEvent
	if err := xml.NewDecoder(strings.NewReader(raw)).Decode(&ev); err != nil {
		return nil
	}
	return &ev
}

func (ev *winEvent) dataMap() map[string]string {
	m := make(map[string]string, len(ev.EventData.Data))
	for _, d := range ev.EventData.Data {
		if d.Name != "" {
			m[d.Name] = d.Value
		}
	}
	return m
}

// ── Translation ───────────────────────────────────────────────────────────────

// translate maps a Windows event to the THE EYE ledger schema.
func (c *Collector) translate(ev *winEvent, _ string) *queue.Event {
	d := ev.dataMap()
	host := ev.System.Computer
	if host == "" {
		host = c.host
	}
	ts := ev.System.TimeCreated.SystemTime
	if ts == "" {
		ts = time.Now().UTC().Format(time.RFC3339Nano)
	} else {
		// Normalise to RFC3339Nano
		if t, err := time.Parse("2006-01-02T15:04:05.9999999Z", ts); err == nil {
			ts = t.UTC().Format(time.RFC3339Nano)
		}
	}

	meta := map[string]interface{}{
		"host":        host,
		"windows_eid": ev.System.EventID,
		"channel":     ev.System.Channel,
		"provider":    ev.System.ProviderName,
	}

	switch ev.System.EventID {
	// ── Authentication ────────────────────────────────────────────────────────
	case 4624:
		actorID := d["TargetUserName"]
		if actorID == "" || actorID == "-" {
			actorID = d["SubjectUserName"]
		}
		meta["logon_type"] = d["LogonType"]
		meta["workstation"] = d["WorkstationName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "auth.login",
			EventCategory: "authentication",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "user",
			ActorID:       sanitize(actorID),
			OriginIP:      sanitizeIP(d["IpAddress"]),
			Metadata:      meta,
		}

	case 4625:
		meta["logon_type"] = d["LogonType"]
		meta["failure_reason"] = d["FailureReason"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "auth.login",
			EventCategory: "authentication",
			Outcome:       "failure",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["TargetUserName"]),
			OriginIP:      sanitizeIP(d["IpAddress"]),
			Metadata:      meta,
		}

	case 4634, 4647:
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "auth.logout",
			EventCategory: "authentication",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "user",
			ActorID:       sanitize(d["TargetUserName"]),
			Metadata:      meta,
		}

	// ── Process execution ─────────────────────────────────────────────────────
	case 4688:
		meta["process_name"] = d["NewProcessName"]
		meta["parent_process"] = d["ParentProcessName"]
		meta["command_line"] = truncate(d["CommandLine"], 500)
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "process.execution",
			EventCategory: "process_execution",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	// ── User account changes ──────────────────────────────────────────────────
	case 4720:
		meta["target_account"] = d["TargetUserName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "user.created",
			EventCategory: "administrative",
			Outcome:       "success",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	case 4726:
		meta["target_account"] = d["TargetUserName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "user.deleted",
			EventCategory: "administrative",
			Outcome:       "success",
			Severity:      "critical",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	// ── Group membership ──────────────────────────────────────────────────────
	case 4732:
		meta["group"] = d["TargetUserName"]
		meta["member"] = d["MemberName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "group.member_added",
			EventCategory: "administrative",
			Outcome:       "success",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	case 4733:
		meta["group"] = d["TargetUserName"]
		meta["member"] = d["MemberName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "group.member_removed",
			EventCategory: "administrative",
			Outcome:       "success",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	// ── Privilege use ─────────────────────────────────────────────────────────
	case 4673:
		meta["privilege"] = d["PrivilegeList"]
		meta["process"] = d["ProcessName"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "privilege.use",
			EventCategory: "authorization",
			Outcome:       "success",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["SubjectUserName"]),
			Metadata:      meta,
		}

	// ── Network connection ────────────────────────────────────────────────────
	case 5156:
		meta["src_ip"] = d["SourceAddress"]
		meta["src_port"] = d["SourcePort"]
		meta["dst_ip"] = d["DestAddress"]
		meta["dst_port"] = d["DestPort"]
		meta["protocol"] = d["Protocol"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "network.connection",
			EventCategory: "network",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "process",
			ActorID:       sanitize(d["Application"]),
			Metadata:      meta,
		}

	// ── Service lifecycle ─────────────────────────────────────────────────────
	case 7045:
		meta["service_name"] = d["ServiceName"]
		meta["service_file"] = d["ImagePath"]
		meta["service_type"] = d["ServiceType"]
		meta["start_type"] = d["StartType"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "service.installed",
			EventCategory: "administrative",
			Outcome:       "success",
			Severity:      "critical",
			ActorType:     "user",
			ActorID:       sanitize(d["AccountName"]),
			Metadata:      meta,
		}

	case 7036:
		meta["service_name"] = d["ServiceName"]
		meta["service_state"] = d["ServiceState"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "service.state_change",
			EventCategory: "system",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "system",
			ActorID:       host,
			Metadata:      meta,
		}

	// ── System lifecycle ──────────────────────────────────────────────────────
	case 6005:
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "system.startup",
			EventCategory: "system",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "system",
			ActorID:       host,
			Metadata:      meta,
		}

	case 6006:
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "system.shutdown",
			EventCategory: "system",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "system",
			ActorID:       host,
			Metadata:      meta,
		}

	// ── PowerShell script block logging ───────────────────────────────────────
	case 4104:
		meta["script_path"] = d["Path"]
		// Note: we deliberately do NOT include ScriptBlockText to avoid
		// capturing raw_content, which is in the forbidden metadata key list.
		meta["script_block_id"] = d["ScriptBlockId"]
		meta["message_number"] = d["MessageNumber"]
		meta["message_total"] = d["MessageTotal"]
		return &queue.Event{
			OccurredAt:    ts,
			EventType:     "powershell.script_block",
			EventCategory: "process_execution",
			Outcome:       "success",
			Severity:      "high",
			ActorType:     "user",
			ActorID:       sanitize(d["UserID"]),
			Metadata:      meta,
		}
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func sanitize(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "-" || s == "N/A" {
		return "unknown"
	}
	return s
}

func sanitizeIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" || ip == "-" || ip == "::1" || ip == "127.0.0.1" {
		return ""
	}
	return ip
}

func truncate(s string, max int) string {
	if len(s) > max {
		return s[:max]
	}
	return s
}
