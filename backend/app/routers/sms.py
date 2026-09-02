"""Satellite/SMS incident webhook (issue #74).

A field officer with no data connection sends a compressed NavNER-CP report
over satellite SMS (simulated for the demo with a real SMS to a Twilio
number, per the issue's demo strategy). Twilio turns that into an inbound
webhook here, which decodes it and creates the same Incident row a normal app
submission would — just missing its image until the phone reaches a network
and syncs it (see PATCH /api/v1/incidents/{id}/image).

Kept as its own router rather than folded into incidents.py: this endpoint's
caller is Twilio, not the app, so its request shape (form-encoded, no auth
header, address-based sender identity) and its response format (TwiML, not
JSON) are both unlike every other endpoint in this codebase.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import Response
from geoalchemy2.functions import ST_MakePoint
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.request_validator import RequestValidator

from app.config import settings
from app.database import get_db
from app.models import Incident, IncidentSource
from app.services.sms_bridge import SmsDecodeError, decode_nner_cp
from app.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sms", tags=["satellite-sms"])


def _twiml(message: str) -> Response:
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Message>{message}</Message></Response>"
    )
    return Response(content=body, media_type="application/xml")


async def _verify_twilio_signature(request: Request) -> None:
    """Reject a webhook call that did not really come from Twilio.

    Off by default (see TWILIO_VALIDATE_SIGNATURE in app.config) because it
    needs a real Twilio auth token and the exact public URL Twilio was
    configured with — neither exists in local dev. Any deployment with a real
    inbound number must turn this on, or the webhook accepts SMS-shaped
    incidents from anyone who finds the URL.
    """
    if not settings.TWILIO_VALIDATE_SIGNATURE:
        return

    if not settings.TWILIO_AUTH_TOKEN:
        # Asked to validate with nothing to validate against — fail closed
        # rather than silently accepting everything.
        raise HTTPException(status_code=500, detail="Twilio auth token not configured")

    signature = request.headers.get("X-Twilio-Signature", "")
    form = await request.form()
    validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
    if not validator.validate(str(request.url), dict(form), signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")


@router.post("/webhook")
async def receive_sms(
    request: Request,
    Body: str = Form(...),
    From: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Twilio's inbound SMS webhook. Twilio always POSTs form-encoded data
    with these exact field names, which is why they are capitalised here
    against the codebase's usual snake_case."""
    await _verify_twilio_signature(request)

    if not Body.strip().upper().startswith("NNER|"):
        # Not every SMS to this number is a NavNER-CP report — acknowledge
        # without creating anything, rather than 400ing a message this
        # endpoint was never meant to parse.
        logger.info("[SMS] Ignoring non-NavNER-CP message from %s", From)
        return _twiml("Message received but not recognised as a NavNER report.")

    try:
        report = decode_nner_cp(Body)
    except SmsDecodeError as exc:
        logger.warning("[SMS] Malformed NavNER-CP payload from %s: %s", From, exc)
        return _twiml(f"Could not parse report: {exc}")

    existing = (
        await db.execute(
            select(Incident).where(Incident.readable_id == report.incident_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        # The field app may retransmit if it never received a delivery
        # receipt over a flaky satellite link. Acknowledging without a
        # duplicate row is the correct response to that, not an error.
        logger.info("[SMS] Duplicate report %s from %s, already on file", report.incident_id, From)
        return _twiml(f"Report {report.incident_id} already received.")

    incident = Incident(
        type=report.incident_type,
        location=ST_MakePoint(report.lng, report.lat),
        description=report.description,
        severity=report.severity,
        source=IncidentSource.SATELLITE_SMS,
        readable_id=report.incident_id,
        # The dashboard's placeholder-icon behaviour (§4B) keys off this exact
        # sentinel rather than a null image_url, so "no photo was ever taken"
        # and "the photo has not arrived yet" are visibly different states.
        image_url="PENDING_NETWORK_SYNC",
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

    now = datetime.now(timezone.utc)
    await manager.broadcast(
        {
            "event": "new_incident",
            "data": {
                "id": str(incident.id),
                "readable_id": incident.readable_id,
                "type": report.incident_type.value,
                "severity": report.severity.value,
                "lat": report.lat,
                "lng": report.lng,
                "description": report.description,
                "image_url": incident.image_url,
                "source": IncidentSource.SATELLITE_SMS.value,
                "status": "open",
                "created_at": now.isoformat(),
            },
        }
    )

    logger.info(
        "[SMS] Ingested %s (%s, %s) from %s at (%.4f, %.4f)",
        report.incident_id, report.incident_type.value, report.severity.value,
        From, report.lat, report.lng,
    )

    return _twiml(f"Report {report.incident_id} received — plotted on NavNER.")


# ── Jurisdiction-Based SMS Alerting (Module D Mock) ───────────────────────────

from pydantic import BaseModel

class DispatchAlertRequest(BaseModel):
    trip_id: str
    status: str
    district: str

@router.post("/dispatch-alert")
async def dispatch_jurisdiction_alert(payload: DispatchAlertRequest):
    """
    Mock endpoint to simulate dispatching an SMS alert to a municipal officer 
    when a truck headed to their jurisdiction is rerouted/delayed.
    """
    logger.info(
        "[SMS OUTBOUND] Dispatching alert to municipal officer in %s for Trip %s (Status: %s)",
        payload.district, payload.trip_id, payload.status
    )
    return {"status": "alert_dispatched", "recipient_district": payload.district}
