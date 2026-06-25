from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # exc.errors() can embed the raw exception instance in ctx (e.g. for custom
    # @field_validator/@model_validator ValueErrors) -- jsonable_encoder converts
    # those to strings; plain json.dumps via JSONResponse can't serialize them.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation failed", "errors": jsonable_encoder(exc.errors())},
    )
