"""Repository-owned Stripe checkout adapter using the official SDK."""
from dataclasses import dataclass
from decimal import Decimal

import stripe


@dataclass(frozen=True)
class CheckoutSessionRequest:
    amount: float
    currency: str
    success_url: str
    cancel_url: str
    metadata: dict
    label: str


@dataclass(frozen=True)
class CheckoutSession:
    session_id: str
    url: str | None
    status: str | None
    payment_status: str
    amount_total: int | None
    currency: str | None

    @classmethod
    def from_stripe(cls, session):
        if isinstance(session, stripe.StripeObject):
            session = session.to_dict()
        return cls(
            session_id=session["id"], url=session.get("url"),
            status=session.get("status"), payment_status=session.get("payment_status", "unpaid"),
            amount_total=session.get("amount_total"), currency=session.get("currency"),
        )


class StripeCheckout:
    def __init__(self, api_key: str):
        self.client = stripe.StripeClient(api_key)

    async def create_checkout_session(self, request: CheckoutSessionRequest) -> CheckoutSession:
        session = await self.client.v1.checkout.sessions.create_async({
            "mode": "payment",
            "success_url": request.success_url,
            "cancel_url": request.cancel_url,
            "metadata": request.metadata,
            "line_items": [{"quantity": 1, "price_data": {
                "currency": request.currency,
                "unit_amount": int(Decimal(str(request.amount)) * 100),
                "product_data": {"name": request.label},
            }}],
        })
        return CheckoutSession.from_stripe(session)

    async def get_checkout_status(self, session_id: str) -> CheckoutSession:
        session = await self.client.v1.checkout.sessions.retrieve_async(session_id)
        return CheckoutSession.from_stripe(session)


def verify_webhook(body: bytes, signature: str, secret: str):
    """Never accept an unsigned event, even when no API key is configured."""
    if not secret:
        raise ValueError("Stripe webhook secret is not configured")
    try:
        return stripe.Webhook.construct_event(body, signature, secret).to_dict()
    except stripe.SignatureVerificationError as exc:
        raise ValueError("Invalid Stripe signature") from exc
