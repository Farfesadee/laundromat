"""Pydantic v2 request/response schemas."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    preferred_name: str = Field(default="", max_length=80)
    phone: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginIn(BaseModel):
    phone: str = ""
    email: str = ""
    password: Optional[str] = None

class GoogleExchangeIn(BaseModel):
    code: str

class StaffLoginIn(BaseModel):
    email: str
    password: str

class OTPRequest(BaseModel):
    phone: str

class OTPVerify(BaseModel):
    phone: str
    code: str

class CustomerOut(BaseModel):
    id: str; preferred_name: str = ""; first_name: str = ""; last_name: str = ""
    phone: str = ""; email: str = ""; segment: str = "new"; customer_code: str = ""
    class Config: from_attributes = True

class OrderCreate(BaseModel):
    customer_id: Optional[str] = None
    phone: Optional[str] = None
    preferred_name: str = ""
    washes: int = Field(default=1, ge=1, le=20)
    type: str = "self_service"
    channel: str = "in_store"
    addons: list[dict] = []
    idempotency_key: str = ""

class PaymentIn(BaseModel):
    method: str = "cash"
    amount: int  # kobo
    paystack_reference: Optional[str] = None

class MachinePatch(BaseModel):
    status: str
    reason: str = ""
    unavailable_until: Optional[datetime] = None

class ReworkIn(BaseModel):
    type: str = "rewash"
    reason: str = ""
    machine_id: str = ""
    extra_minutes: int = 20

class RestartIn(BaseModel):
    reason: str = ""
    pin: str = ""
    machine_id: str = ""

class SkipIn(BaseModel):
    reason: str = ""

class SettingPut(BaseModel):
    value: Any
