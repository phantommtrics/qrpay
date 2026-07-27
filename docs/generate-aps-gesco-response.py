#!/usr/bin/env python3
"""Generate APS response to Gesco Pay as .docx (stdlib only)."""

import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent / "APS_Response_to_Gesco_Pay.docx"

# Paragraph helpers
def p(text: str, bold: bool = False, size=None) -> str:
    rpr = ""
    if bold:
        rpr += "<w:b/>"
    if size:
        rpr += f'<w:sz w:val="{size}"/>'
    rpr_block = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
    return f"<w:p><w:r>{rpr_block}<w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"

def heading(text: str, level: int = 1) -> str:
    sizes = {1: 32, 2: 28, 3: 24}
    return p(text, bold=True, size=sizes.get(level, 24))

def blank() -> str:
    return "<w:p/>"

def table_row(cells: list[str], header: bool = False) -> str:
    rows = []
    for cell in cells:
        rpr = "<w:rPr><w:b/></w:rPr>" if header else ""
        rows.append(
            f'<w:tc><w:p><w:r>{rpr}<w:t xml:space="preserve">{escape(cell)}</w:t></w:r></w:p></w:tc>'
        )
    return f"<w:tr>{''.join(rows)}</w:tr>"

def table(headers: list[str], rows: list[list[str]]) -> str:
    body = table_row(headers, header=True) + "".join(table_row(r) for r in rows)
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>'
        f"{body}</w:tbl>"
    )

content = [
    heading("APS Wallet — Response to Gesco Pay Engineering", 1),
    p("Date: 27 July 2026"),
    p("To: Gesco Pay Engineering"),
    p("From: APS Wallet / Payment Gateway Product Team"),
    p("Re: Integration requirements — sandbox testing of 15 July 2026"),
    blank(),

    heading("1. Purpose of this document", 2),
    p(
        "Thank you for your detailed letter and for the time you spent testing our sandbox on 15 July 2026. "
        "We have reviewed your requirements in full and discussed them with you in our recent meeting."
    ),
    p(
        "We want to be direct: there was a misunderstanding about what our Payment Gateway merchant product is designed to do. "
        "Your letter describes the needs of a payment aggregator — a third party that connects many businesses to many payment rails, "
        "routes money between parties, and must prove to regulators exactly where every dalasi went."
    ),
    p(
        "Our Payment Gateway merchant product is a collection product. It allows a registered merchant to collect payments from "
        "APS Wallet customers who approve a charge via OTP. It is not a corridor product, a disbursement platform, or an "
        "aggregator infrastructure API. It was not built for third-party sending-money providers to operate as a money-movement "
        "rail between multiple downstream merchants and customers."
    ),
    p(
        "This distinction is not a detail — it explains most of the gaps you identified. We answer each item honestly below, "
        "using one of: Yes, and here is how / Yes, but later (with date) / No, we will not do this."
    ),
    blank(),

    heading("2. What already works — confirmed", 2),
    p("We agree with your positive findings from sandbox testing:"),
    p("• Login works (including the deviceInfo issue you previously reported, which is resolved)."),
    p("• The OTP flow (authorize-customer → confirm-customer) is working as designed."),
    p("• The API is fast and stable for its intended use case."),
    p("This is not a rejection of Gesco Pay. It is an honest product-scope clarification."),
    blank(),

    heading("3. Product scope — collection only, not corridor", 2),
    p(
        "Following our meeting, we confirm the following for Gesco Pay specifically:"
    ),
    p(
        "• Gesco Pay intends to operate as a third-party sending-money provider / payment aggregator, connecting multiple "
        "downstream businesses to APS and other rails through a single integration."
    ),
    p(
        "• Our merchant Payment Gateway product supports collection: a merchant receives money from a customer's APS Wallet "
        "after the customer confirms via OTP (process-payment)."
    ),
    p(
        "• Our merchant product does not support operating as a corridor or disbursement rail for aggregators. "
        "Features such as send-payment, bulk payouts, partner idempotency keys, and sub-merchant hierarchies belong to "
        "different product lines — or do not exist in our current merchant API — and are outside the scope of what we can "
        "offer Gesco Pay under this product."
    ),
    p(
        "We would rather tell you this clearly now than give optimistic answers that delay your planning."
    ),
    blank(),

    heading("4. Item-by-item responses", 2),
    blank(),

    heading("4.1 — client_reference on process-payment and send-payment", 3),
    p("Answer: No, we will not do this on the merchant collection product in the form you described."),
    p(
        "Our merchant API does not accept a partner-supplied client_reference or idempotency key on process-payment. "
        "There is no lookup by partner reference on /transaction."
    ),
    p(
        "Why: The merchant collection product assumes a single merchant, a single checkout session, and synchronous "
        "confirmation on screen. It was not architected for aggregator-scale retry semantics or lost-response recovery "
        "at thousands of transactions per day."
    ),
    p(
        "For Gesco Pay: If you require idempotency keys and lookup by partner reference as a condition of going live, "
        "the merchant collection product alone cannot meet that requirement. Aggregator-grade idempotency would require "
        "a different product engagement with APS, not an extension of the current merchant API."
    ),
    blank(),

    heading("4.2 — send-payment must return a transaction ID", 3),
    p("Answer: Not applicable to your intended use case under the merchant collection product."),
    p(
        "send-payment is a disbursement feature. Our merchant product for Gesco Pay is collection only. "
        "We will not enable send-payment / corridor disbursement for Gesco Pay as a third-party sending-money provider."
    ),
    p(
        "Your finding that successful send-payment returns empty responseData is noted. For merchants who are approved "
        "for disbursement under a separate product, we are working to improve response payloads — but this is not on the "
        "path for Gesco Pay's collection-only integration."
    ),
    blank(),

    heading("4.3 — What /transaction actually returns", 3),
    p("Answer: Yes, and here is how — for collection transactions only."),
    p(
        "The /transaction endpoint accepts an APS transaction_id (returned on successful process-payment). "
        "We will publish an updated schema for collection lookups in our merchant documentation by 15 August 2026."
    ),
    p("Expected fields for a collection transaction lookup:"),
    p("• transaction_id — APS reference"),
    p("• amount — amount in dalasi"),
    p("• status — transaction status"),
    p("• mobile — customer mobile (masked in logs)"),
    p("• created_at — timestamp"),
    p("• type — COLLECTION"),
    p(
        "Lookup by client_reference (your reference) is not supported and will not be added to the merchant collection product."
    ),
    blank(),

    heading("4.4 — Machine-readable status and error codes", 3),
    p("Answer: Yes, but later — target 30 September 2026 for merchant collection API."),
    p(
        "We acknowledge that error responses today mix prose messages and inconsistent formats. "
        "We are planning a structured error envelope for the merchant collection endpoints, including a stable code field "
        "and a money_moved indicator where applicable."
    ),
    p(
        "Interim guidance until then: treat responseDescription = \"fail\" as failure regardless of responseCode. "
        "Do not rely on responseCode = \"0\" alone."
    ),
    blank(),

    heading("4.5 — responseCode \"0\" on a failed transaction", 3),
    p("Answer: Yes, and here is how — confirmed bug; interim rule below."),
    p(
        "You are correct. Returning responseCode \"0\" alongside responseDescription \"fail\" is misleading and we are fixing it."
    ),
    p("Official interim success rule for process-payment (until the fix is deployed):"),
    p("Treat as SUCCESS only if ALL of the following are true:"),
    p("1. HTTP status is 2xx"),
    p("2. responseDescription is \"success\" (not \"fail\")"),
    p("3. responseData contains a transaction_id or reference"),
    p("Treat as FAILURE if responseDescription is \"fail\", regardless of responseCode."),
    p("Treat as UNKNOWN on timeout or no response body — do not auto-retry without idempotency."),
    p("Fix targeted for merchant collection API: 15 August 2026."),
    blank(),

    heading("4.6 — Enable send-payment on sandbox", 3),
    p("Answer: No, we will not enable this for Gesco Pay."),
    p(
        "Following our meeting, Gesco Pay's intended model is third-party sending-money / aggregator corridor operations. "
        "Our merchant product for you is collection only. send-payment will not be enabled on your sandbox or production "
        "merchant account under this product line."
    ),
    p(
        "If Gesco Pay wishes to discuss a separate APS disbursement or corridor product in future, that is a different "
        "commercial and compliance conversation — not an extension of the merchant collection API."
    ),
    blank(),

    heading("4.7 — Per-business customer linking / sub-merchant model", 3),
    p("Answer: No sub-merchant / aggregator model on the merchant collection product."),
    p(
        "When a customer confirms OTP, the authorized_token links the customer to your APS merchant account — the account "
        "whose credentials are used for the API bearer token. The token does not scope consent to a specific downstream business."
    ),
    p("What this means for Gesco Pay:"),
    p(
        "• If Gesco Pay operates under one APS merchant wallet for all downstream businesses, a customer who approves OTP "
        "for one shop is linked at the APS level to Gesco Pay's merchant account — not to an individual downstream merchant."
    ),
    p(
        "• We do not offer a sub-merchant or per-downstream-business linking model on the merchant collection API."
    ),
    p(
        "• Recommended pattern for collection-only use: each downstream business registers as its own APS merchant with its "
        "own credentials; collection happens under that merchant's account. Gesco Pay may integrate on their behalf, but "
        "each business holds its own merchant relationship with APS."
    ),
    p(
        "• After each successful process-payment, call unlink-customer to remove the customer link. Do not store "
        "authorized_token across businesses or across long time periods."
    ),
    p(
        "We understand this is your biggest concern. Under a single Gesco Pay merchant account serving many downstream "
        "businesses, the merchant collection product does not provide the per-business consent model you require. "
        "Separate merchant accounts per downstream business is the supported approach today."
    ),
    blank(),

    heading("4.8 — authorized_token lifetime, revocation, and errors", 3),
    p("Answer: Yes, and here is how — partial documentation today; full documentation by 15 August 2026."),
    p("• authorized_token does not have a published expiry in the API response today."),
    p("• Best practice: use the token immediately for a single process-payment, then call unlink-customer."),
    p("• unlink-customer revokes the link using the authorized_token from confirm-customer."),
    p("• If a revoked or invalid token is used on process-payment, APS returns an error (prose today; structured code after 4.4)."),
    p("• We do not support long-lived standing mandates on the merchant collection product."),
    blank(),

    heading("4.9 — Decimals: what happens to 10.50?", 3),
    p("Answer: Yes, and here is how — whole dalasi only."),
    p(
        "The merchant collection product accepts whole dalasi amounts only, minimum 1 dalasi. "
        "Amounts such as 10.50 should be rejected. We acknowledge sandbox validation currently accepts 10.50 "
        "inconsistently — this is a validation bug. We will enforce integer-only amounts by 15 August 2026."
    ),
    p("Until then: send integer amounts only (e.g. \"500\", not \"500.00\" or \"10.50\")."),
    blank(),

    heading("4.10 — Balance endpoint", 3),
    p("Answer: No, not on the merchant Payment Gateway API."),
    p(
        "There is no balance inquiry endpoint in the merchant collection API. Merchants may view balance through "
        "the APS merchant app / agent channel. An API balance endpoint is not planned for the merchant collection product."
    ),
    blank(),

    heading("4.11 — Refunds", 3),
    p("Answer: No refund API on the merchant collection product."),
    p(
        "There is no automated refund or reversal endpoint. Wrong charges must be handled through APS merchant "
        "support and operations. We recommend you inform downstream businesses that API refunds are not available "
        "on APS Wallet collection today."
    ),
    blank(),

    heading("4.12 — Login token expiry", 3),
    p("Answer: Yes, and here is how."),
    p("• The merchant bearer token from POST /api/v1/login expires."),
    p("• If the login response includes expires_in (seconds), use that value."),
    p("• If expires_in is absent, assume approximately 50 minutes and re-login proactively."),
    p("• On HTTP 401, discard the cached token and obtain a new one via login."),
    p("• Always send Accept: application/json on login and all API calls."),
    blank(),

    heading("4.13 — Production URL and go-live process", 3),
    p("Answer: Yes, and here is how — for collection-only merchant onboarding."),
    p("• Sandbox: https://sandbox-api.apswallet.gm (UAT may also use https://uat-wallet.apsmoney.gm)"),
    p("• Production URL and credentials are issued after merchant KYC and product approval."),
    p("• Go-live steps: complete business verification → receive production credentials → enable process-payment (collection) → production smoke test → sign-off."),
    p("• Gesco Pay go-live under this product is collection only. send-payment / corridor will not be part of the approval."),
    blank(),

    heading("4.14 — Phone number format", 3),
    p("Answer: Yes, and here is how."),
    p("• Format: local Gambian mobile number, no country code."),
    p("• Do not send +220 or 00220 prefix."),
    p("• Valid example: 9595958 (7 digits)."),
    p("• Invalid example: +2209595958."),
    p("• Our documentation incorrectly showed 8-character examples in places; the correct format is 7-digit local mobile."),
    blank(),

    heading("4.15 — Documentation errors", 3),
    p("Answer: Yes — fixes in progress, target 15 August 2026."),
    p("We confirm the following documentation errors you reported:"),
    p("• process-payment amount validation error incorrectly references the otp field."),
    p("• confirm-customer error messages shown in wrong context in docs."),
    p("• unlink-customer docs incorrectly state token source is authorize-customer; correct source is confirm-customer."),
    p("• Login example missing Accept: application/json header."),
    p("• Login body must include username (not mobile alone)."),
    blank(),

    heading("5. Summary table", 2),
    table(
        ["Item", "Subject", "Answer"],
        [
            ["4.1", "client_reference / idempotency", "No — not on merchant collection product"],
            ["4.2", "send-payment transaction ID", "N/A — send-payment not offered to Gesco Pay"],
            ["4.3", "/transaction response schema", "Yes — collection only; docs by 15 Aug 2026"],
            ["4.4", "Machine-readable error codes", "Yes, but later — 30 Sep 2026"],
            ["4.5", "responseCode rule", "Yes — interim rule now; fix by 15 Aug 2026"],
            ["4.6", "Enable send-payment sandbox", "No — collection only for Gesco Pay"],
            ["4.7", "Per-business linking / sub-merchant", "No — separate merchant accounts per business"],
            ["4.8", "authorized_token lifetime", "Yes — docs by 15 Aug 2026; unlink after payment"],
            ["4.9", "Decimals", "Yes — whole dalasi only; validation fix by 15 Aug 2026"],
            ["4.10", "Balance endpoint", "No"],
            ["4.11", "Refunds", "No API refund on merchant product"],
            ["4.12", "Login token expiry", "Yes — expires_in or ~50 min"],
            ["4.13", "Production URL / go-live", "Yes — via merchant onboarding (collection only)"],
            ["4.14", "Phone format", "Yes — 7-digit local, no +220"],
            ["4.15", "Documentation fixes", "Yes — by 15 Aug 2026"],
        ],
    ),
    blank(),

    heading("6. What this means for Gesco Pay", 2),
    p(
        "Your letter correctly identifies what a payment aggregator needs: idempotency keys, verifiable disbursements, "
        "machine-readable errors, per-business consent, and independent reconciliation. Those are legitimate requirements "
        "for a third-party sending-money provider."
    ),
    p(
        "Our merchant Payment Gateway product is not that product. It is a collection product for registered merchants "
        "to receive payments from APS Wallet customers. It is not a corridor, not a disbursement rail, and not aggregator "
        "infrastructure."
    ),
    p(
        "Blocking items 4.1 and 4.2 — which you correctly identified as essential for safe aggregator operation — "
        "will not be delivered on the merchant collection product. Item 4.6 (send-payment) will not be enabled for Gesco Pay "
        "under the scope confirmed in our meeting."
    ),
    p(
        "If Gesco Pay's business model requires operating as a third-party sending-money provider routing money between "
        "parties through APS, you should plan accordingly: the merchant collection API alone cannot support that model safely."
    ),
    p(
        "If individual downstream businesses wish to collect from APS Wallet customers under their own merchant accounts, "
        "we can support that through separate merchant onboarding per business — collection only, with the patterns described above."
    ),
    blank(),

    heading("7. Next steps", 2),
    p("• APS will publish updated merchant collection documentation by 15 August 2026 (items 4.3, 4.5, 4.8, 4.9, 4.14, 4.15)."),
    p("• APS will deploy structured error codes for merchant collection by 30 September 2026 (item 4.4)."),
    p("• If Gesco Pay wishes to discuss a separate APS corridor or disbursement product, contact your APS relationship manager."),
    p("• For merchant collection go-live (per downstream business): contact APS merchant onboarding."),
    blank(),
    p("We appreciate your thorough testing and your directness. A clear understanding of product scope serves both parties better than optimistic commitments we cannot deliver."),
    blank(),
    p("APS Wallet / Payment Gateway Product Team"),
    p("Contact: merchant-integration@apswallet.gm"),
]

document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {''.join(content)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>"""

content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

doc_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>"""

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document_xml)
    z.writestr("word/_rels/document.xml.rels", doc_rels)

print(f"Created: {OUT}")
