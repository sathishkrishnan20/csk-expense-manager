import { isNumberCell, isoFromPrinted, normaliseLine, parseScaled } from "./pdfLines";

// Reads the confirmation a fund house emails after each purchase (a SIP instalment): a PDF account statement (Axis, Mirae Asset, Nippon India from KFintech;
// SBI from CAMS) or, from ICICI Prudential and Kotak, the email's own text. Each fund house words and lays it out differently, so each has its own reader below;
// every one gives the same few facts about a purchase: the fund (its ISIN, folio number or name), the date, the units, the net amount and the stamp duty. The
// monthly CAS has the same purchases, so they are matched on fund + date + units (savingsSql.ts) and the CAS replaces them for every month it covers. Pure.
export interface FundRef {
  isin: string | null;
  folio: string | null;
  name: string | null;
}

export interface SipPurchase extends FundRef {
  date: string; // the day it was allotted, "2026-11-05"
  unitsE4: number; // units x 10,000 (they are printed with three decimals)
  netPaise: number; // what bought the units
  stampPaise: number; // the stamp duty on top; with the net amount it is what left the bank
  navE4: number | null;
}

// Stamp duty is 0.005% of the gross amount: 6,000.00 gross is 5,999.70 net and 0.30 duty. Used when a confirmation does not print it.
const stampOf = (netPaise: number): number => Math.round((netPaise * 0.00005) / (1 - 0.00005));

// A folio number without spaces and without the "/check digit" that a CAS adds ("910157128972/0" and "9101 5712 8972" are the same folio).
export const normaliseFolio = (folio: string): string => folio.replace(/\s+/g, "").split("/")[0].toUpperCase();

const normaliseName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const NOT_A_PURCHASE = /redemption|switch|reinvest|dividend|payout|withdraw|transfer/i;
const SLASH_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const MONTH_DATE = /^\d{2}-[A-Za-z]{3}-\d{4}$/;

interface Facts {
  date: string | null;
  net: string;
  nav: string | null;
  units: string;
  stamp?: string | null;
}

function purchase(ref: FundRef, f: Facts): SipPurchase | null {
  const date = f.date ? isoFromPrinted(f.date) : null;
  const unitsE4 = parseScaled(f.units, 4);
  const netPaise = parseScaled(f.net, 2);
  if (!date || unitsE4 === null || unitsE4 <= 0 || netPaise === null || netPaise <= 0) return null;
  const stamp = f.stamp ? parseScaled(f.stamp, 2) : null;
  const nav = f.nav ? parseScaled(f.nav, 4) : null;
  return { ...ref, date, unitsE4, netPaise, stampPaise: stamp ?? stampOf(netPaise), navE4: nav };
}

// ---- PDFs ---------------------------------------------------------------------------------------------------------------------------------------

// The purchases in a fund house's account statement PDF (as lines, see pdfLines.ts); empty when the PDF is not one of the four layouts that are read. The statement
// also lists older instalments; they are all returned, and whoever stores them leaves out the ones a CAS already covers.
export function readSipPdf(rawLines: readonly string[]): SipPurchase[] {
  const lines = rawLines.map(normaliseLine).filter((l) => l !== "");

  let folio: string | null = null;
  for (const l of lines) {
    const m = l.match(/Folio\s*(?:No\.?|NUMBER)?\s*:?\s*\|?\s*(\d[\d ]{4,}\d)/i);
    if (m) {
      folio = m[1].replace(/\s+/g, "");
      break;
    }
  }
  // Axis prints the stamp duty on its own line before the instalment ("Stamp Duty | 06/07/2026 | 0.30").
  const stampOn = new Map<string, string>();
  for (const l of lines) {
    const m = l.match(/^Stamp Duty \| (\d{2}\/\d{2}\/\d{4}) \| ([\d.]+)$/i);
    if (m) stampOn.set(m[1], m[2]);
  }

  const out: SipPurchase[] = [];
  let isin: string | null = null;
  let pendingStamp: string | null = null; // Mirae: "Stamp Duty | 0.25" just before the instalment
  lines.forEach((line, i) => {
    const marker = line.match(/ISIN(?:\s*CODE)?\s*:\s*(INF[A-Z0-9]{9})/i);
    if (marker) isin = marker[1].toUpperCase();
    const lone = line.match(/^Stamp Duty \| ([\d.]+)$/i);
    if (lone) pendingStamp = lone[1];
    if (!isin || marker) return;

    const cells = line.split(" | ");
    const ref: FundRef = { isin, folio, name: null };
    let found: SipPurchase | null = null;

    if (cells.length === 8 && /^Net .*(Investment|Purchase)/i.test(cells[0]) && SLASH_DATE.test(cells[1]) && cells.slice(2).filter(isNumberCell).length >= 5) {
      // Axis: description | date | NAV | NAV date | net amount | price | units | balance
      found = purchase(ref, { date: cells[1], nav: cells[2], net: cells[4], units: cells[6], stamp: stampOn.get(cells[1]) });
    } else if (cells.length === 6 && /^Net .*(Investment|Purchase)\(NAV Dt : \d{2}\/\d{2}\/\d{4}\)/i.test(cells[0])) {
      // Mirae Asset: description (with the NAV date) | net amount | NAV | price | units | balance
      const date = cells[0].match(/NAV Dt : (\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;
      found = purchase(ref, { date, nav: cells[2], net: cells[1], units: cells[4], stamp: pendingStamp });
    } else if (cells.length === 6 && SLASH_DATE.test(cells[0]) && /Invest|Purchase/i.test(cells[1]) && !NOT_A_PURCHASE.test(cells[1]) && cells.slice(2).every(isNumberCell)) {
      // Nippon India: date | description (with the stamp duty) | net amount | NAV | units | balance
      found = purchase(ref, { date: cells[0], nav: cells[3], net: cells[2], units: cells[4], stamp: cells[1].match(/Stamp duty Rs\s*([\d.]+)/i)?.[1] });
    } else if (cells.length === 7 && MONTH_DATE.test(cells[0]) && /Purchase|Invest/i.test(cells[1]) && !NOT_A_PURCHASE.test(cells[1]) && cells.slice(2).every(isNumberCell)) {
      // SBI (CAMS): date | description | net amount | NAV | price | units | balance, and the stamp duty on the line after
      found = purchase(ref, { date: cells[0], nav: cells[3], net: cells[2], units: cells[5], stamp: (lines[i + 1] ?? "").match(/Stamp Duty[^|]*\|\s*([\d.]+)/i)?.[1] });
    }
    if (found) {
      out.push(found);
      pendingStamp = null;
    }
  });
  return out;
}

// ---- email text ---------------------------------------------------------------------------------------------------------------------------------

const MONEY = "([\\d,]+(?:\\.\\d+)?)";

// The purchase in the text of a confirmation email (ICICI Prudential's table or Kotak's sentence), or null when the text is neither. Kotak's email does not name the
// folio; it is in the subject ("Folio 10798071 - Processing of Purchase in Kotak Mutual Fund").
export function readSipText(subject: string, rawText: string): SipPurchase | null {
  // An email the owner forwarded by hand from Gmail comes back with Gmail's own plain-text version of it: bold values wrapped in asterisks (Rs.*4,999.75*), links as
  // <https://...>, and long lines broken. All of that is set aside, so the original email and a hand-forwarded copy read the same.
  const text = rawText
    .replace(/<[^<>\s]+>/g, " ")
    .replace(/\[image:[^\]]*\]/gi, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ");
  const folioInSubject = subject.match(/Folio\s*(?:No\.?)?\s*:?\s*(\d[\d ]{3,}\d)/i)?.[1]?.replace(/\s+/g, "") ?? null;

  const kotak = text.match(new RegExp(`Your purchase request in (.+?) for Rs\\.?\\s*${MONEY} has been processed at the NAV of ${MONEY} on (\\d{2}-[A-Za-z]{3}-\\d{4}) for ${MONEY} Units`, "i"));
  if (kotak) {
    if (NOT_A_PURCHASE.test(kotak[1])) return null;
    return purchase({ isin: null, folio: folioInSubject, name: kotak[1].trim() }, { date: kotak[4], nav: kotak[3], net: kotak[2], units: kotak[5] });
  }

  const icici = text.match(new RegExp(`Folio No\\s+(\\d+)\\s+Scheme Name\\s+(.+?)\\s+Amount\\(Rs\\.\\)\\s*${MONEY}(?:\\s+Stamp Duty\\(Rs\\.\\)\\s*${MONEY})?\\s+Net Amount \\(Rs\\.\\)\\s*${MONEY}\\s+Value Date\\s+(\\d{2}-[A-Za-z]{3}-\\d{4})\\s+Net Asset Value \\(Rs\\.\\)\\s*${MONEY}\\s+Units\\s+${MONEY}`, "i"));
  if (icici) {
    return purchase({ isin: null, folio: icici[1], name: icici[2].trim() }, { date: icici[6], nav: icici[7], net: icici[5], units: icici[8], stamp: icici[4] });
  }
  return null;
}

// ---- which fund ---------------------------------------------------------------------------------------------------------------------------------

export interface HoldingRef {
  code: string; // the fund's ISIN
  account: string; // the folio, as the CAS prints it ("910157128972/0")
  name: string;
}

// The fund in the owner's CAS that a purchase belongs to: by ISIN, then by folio number, then by the scheme's name. Null when none matches, or when more than one does
// (a guess could put a purchase into the wrong fund).
export function resolveFund<H extends HoldingRef>(ref: FundRef, holdings: readonly H[]): H | null {
  const byFolio = (list: readonly H[]): H[] => (ref.folio ? list.filter((h) => normaliseFolio(h.account) === normaliseFolio(ref.folio as string)) : []);
  const byName = (list: readonly H[]): H[] => (ref.name ? list.filter((h) => normaliseName(h.name) === normaliseName(ref.name as string)) : []);
  const only = (list: H[]): H | null => (list.length === 1 ? list[0] : null);

  if (ref.isin) {
    const same = holdings.filter((h) => h.code === ref.isin);
    if (same.length > 0) return only(same) ?? only(byFolio(same)) ?? only(byName(same));
  }
  const folio = byFolio(holdings);
  if (folio.length > 0) return only(folio) ?? only(byName(folio));
  return only(byName(holdings));
}

// Whether two purchases of one fund on one day are the same purchase: the same units, to within the last digit printed.
export const sameUnits = (a: number, b: number): boolean => Math.abs(a - b) <= 10;
