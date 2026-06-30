"use client";
import React from "react";
import Sidebar from "@/components/Sidebar";
export default function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
