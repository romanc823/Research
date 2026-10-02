# Phase 2.7 — internal desk

The public GitHub Pages desk stays a research surface. Intentional Accounting can open the same files in an internal desk for a real packet. The packet is ephemeral: it stays in the browser tab, and this repository still does not store it.

No e-file. No upload. Score bands, pass tags, present copy, and `STUB_FLOORS` are unchanged. A planning estimate is a sibling on a High card, or it is absent.

## Turn the internal desk on

On a machine you control:

```bash
npm start
```

Open the printed URL and add the flag:

```text
http://127.0.0.1:8080/?desk=private
```

The red banner is the internal desk. Reload clears the packet. **Return to the public desk** drops the flag.

The public page is the same URL without `?desk=private`. That is the GitHub Pages default: [https://romanc823.github.io/Research/](https://romanc823.github.io/Research/). Do not drop a live client file on that public URL. The flag is a browser switch, not access control, and it does not make GitHub Pages private.

## What the internal desk allows

- A packet without `ANON: TRUE`
- An SSN or EIN pattern in the file. The desk does not keep that pattern in the field bag or in provenance lines
- Form text, not only `LABEL: value`
- Up to 100 PDF pages. Page 101 is refused. A blank page does not become a zero

Text-layer PDFs are read first, including Identity-H fonts with a ToUnicode map. OCR is the fallback. Fax (CCITT), JBIG2, and JPEG2000 pages are rasterized before OCR, the same as the public desk. A page that cannot be painted is refused. The codec itself is not. Lines under the confidence floor are omitted. Cost segregation, Augusta, and hire-kids still need the 0.9 watch floor.

Boxes the reader will keep when the label and one explicit amount are both present:

| Form | What is read | Where it goes |
| --- | --- | --- |
| Form W-2 boxes 1–6 | Wages and withholding | Box 1 can become `earned_income`. Boxes 2–6 stay on the provenance list |
| Form W-2 box 12 codes D, E, AA, BB | Explicit deferral | `trad_ira_or_401k`. Code DD does not |
| Form 1099-R box 1 | Gross distribution | `ira_or_1099r` when the amount is explicit |
| Form 1099-INT box 1 | Interest | Provenance only |
| Form 1099-DIV box 1a | Ordinary dividends | Provenance only |
| SSA-1099 or SSA-1042S box 5 | Net benefits | Provenance only |
| Schedule SE | Net earnings from self-employment | `se_income`, one explicit amount |
| Schedule 1 | SEP, SIMPLE, and qualified plans | `retirement_deduction`, including an explicit 0 |

A missing amount stays missing. Two different Schedule SE amounts are omitted. A name line is not a field.

## What the public desk still refuses

- No `ANON: TRUE`
- Any SSN or EIN pattern
- More than 40 PDF pages
- A live packet committed under `fixtures/` or `samples/`

`npm run check` fails if a fixture contains an SSN or EIN pattern, and it fails if the desk code posts a packet or opens a socket.

## Planning estimate

High cards only. Medium cards stay cite and gate. Silent rows have no estimate.

The only v0 figure is the unclaimed QBI deduction (tentative minus taken) times an explicit ordinary rate on the packet (`MARGINAL RATE: 0.24` or `planning_rate`). The rate has to be greater than 0 and at most 0.37. A missing rate, a hedged rate, or a rate above that cap is omitted. It is not stored as zero.

The estimate sits beside the card. It is not present copy. Types 14 and 15 keep their fixed lines. The pass tag does not change.

Every shown estimate carries: **Planning estimate for human review. Not tax advice.**
