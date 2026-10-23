# Free global METAR and TAF providers: research record

Status: research result, 23-10-2026 (YR-17). Research input only; no provider has been chosen. Evidence is from live checks at about 09:35 UTC on 23-10-2026, sending `Origin: http://localhost:5173`, plus provider documentation. Not yet adopted into DESIGN.md; the owner decides.
Language: British English. Dates DD-MM-YYYY, times UTC.
Scope: free providers only (owner decision, 23-10-2026). Y = verified live, D = from provider documentation only, ? = unverified.

## 1. Key finding
- No free source gives a full global TAF directly to a browser page.
- aviationweather.gov (AWC) is the best data source but sends no CORS header, so a browser page cannot call it. A small stateless proxy is therefore required for TAF.
- A METAR alone can be had with no proxy from metar.vatsim.net or the Iowa Environmental Mesonet (IEM).

## 2. Comparison
| Provider | METAR | TAF | Formats | CORS (GET) | Key | Limits and terms | Official |
|---|---|---|---|---|---|---|---|
| AWC Data API, aviationweather.gov/api/data | Y, 9 of 9 test stations including a small field | Y, 9 of 9 | raw, JSON (decoded), XML, CSV, GeoJSON, IWXXM | None (Y). Its documentation says CORS is not permitted. | None | 100 requests per minute, 400 results maximum, set a custom User-Agent, exceeding the limit is blocked (D). Cache-Control max-age 60. No attribution requirement found. | Yes, US NWS/NOAA |
| NOAA tgftp, tgftp.nws.noaa.gov | Y, 9 of 9 | Y, 9 of 9 | raw text | None (Y) | None | No published limit found (?) | Yes, NOAA |
| metar.vatsim.net | Y | No | raw text | `access-control-allow-origin: *` (Y) | None | max-age 600; query-frequency rule reported on forum (?) | VATSIM community service |
| IEM, mesonet.agron.iastate.edu | Y, 9 of 9 via asos.py (METAR and SPECI) | US only (zero rows for YSSY and EGLL) | CSV, JSON | `*` (Y) | None | Free; fair-use courtesy (?) | No (Iowa State University) |
| Ogimet | Y (getmetar) | gettaf returned 404; not verified (?) | CSV, HTML | None on getmetar (Y) | None | Policy not read (?) | No |
| CheckWX | ? | ? | JSON | none seen (?) | Key required | Free tier limits unverified | Aggregator |
| AVWX | ? | ? | JSON | `*` on the 401 response (Y) | Token required | Limits and licence unconfirmed | Aggregator |
| National services (BoM, Met Office, DWD, Environment Canada, NAV CANADA) | Not tested | Not tested | varied | Not tested | Some need keys (?) | Single-country only, so they fail the any-airport need | Yes, national only |

Keyed services (CheckWX, AVWX) are not recommended: a key in a public static page can be read and abused.

## 3. Data quality
- Coverage: AWC and tgftp returned a current METAR and TAF for YSSY, EGLL, KJFK, RJTT, OMDB, SBGR, FACT, NZAA and YSRI.
- TAF change groups FM, BECMG, TEMPO, INTER and PROB30/40 are preserved by AWC and tgftp.
- Latency for a YSSY SPECI at 09:30Z: AWC, tgftp and IEM had it by about 09:31Z. metar.vatsim.net still served the 09:02Z report at 09:35Z, so it can be 10 to 30 minutes behind.
- Parsing traps:
  - AWC raw text splits `PROB40` and the following `TEMPO` onto separate lines. Parse the single-line `rawTAF` field from the JSON, or join lines before tokenising.
  - AWC JSON TAF `fcsts[]` carries `timeFrom`, `timeTo`, `timeBec`, `fcstChange`, `probability`, `wdir`, `wspd`, `wgst`, `visib`, `wxString`, `clouds`, with times as epoch seconds.
  - `visib` is a string such as `6+` or a number, so convert it before use.
  - `wdir` can be null in a TEMPO that only changes weather.
  - A METAR can contain `//` for an undetected cloud type, which a naive parser rejects.
  - HTTP 204 means no data for a station (small fields often have no TAF).
  - tgftp: each file starts with a `YYYY/MM/DD HH:MM` line; an unknown station returns a 301 redirect, not 404.

## 4. Recommendation
- **Primary:** AWC Data API through a tiny stateless proxy.
  - Upstream: `https://aviationweather.gov/api/data/metar?ids=<ICAO>&format=json` and `https://aviationweather.gov/api/data/taf?ids=<ICAO>&format=json`. Use `rawTAF` as the source of truth and `fcsts[]` as a cross-check.
  - Proxy: only `/metar` and `/taf`, station ids validated, CORS allowed for the app's origin only, a custom User-Agent, and a 60 second edge cache so many users share one upstream call.
- **Fallback for TAF:** NOAA tgftp station files through the same proxy (`.../data/forecasts/taf/stations/<ICAO>.TXT` and `.../data/observations/metar/stations/<ICAO>.TXT`). It is a different NOAA publishing chain from AWC's API, so it covers an API outage, not a total NOAA outage (?).
- **METAR only, no proxy:** IEM `asos.py` (preferred, fresher), with metar.vatsim.net as a cross-check. IEM TAF is US-only and cannot be the TAF fallback.

## 5. Open items
- Ogimet TAF retrieval and usage policy.
- CheckWX and AVWX free limits, licence and CORS with a key.
- tgftp and IEM rate limits and attribution wording.
- Proxy hosting and free-tier limits (for example a Cloudflare Worker).
- National services not tested.
- AWC status page and uptime history not checked; reliability is inferred from the operator.
- AWC's explicit re-use statement not found. Add a data credit line (AWC/NOAA) in the app as good practice.
- Only nine stations at one moment were tested.
- Repeat the CORS test in the YR-2 spike: server behaviour can change.

## 6. How reports are read: maintenance comparison (input to the deferred decision)
| Task | Own parser on raw text | Library for raw text | Provider decoded data |
|---|---|---|---|
| Switch provider | No parser change; only the fetch adapter | No parser change | New field mapping per provider |
| Provider changes format | Unaffected (raw ICAO text is a stable standard) | Unaffected | Breaks when fields move or are renamed |
| New country report style | Extend parser and fixtures (the main recurring cost) | Depends on the library's coverage and upkeep | Depends on the provider's decoding |
| Bugs in unusual reports | Fixed by us with a test | Wait for a library fix, or patch around it | Wait for the provider |
| Dependencies to watch | None | One more package (updates, abandonment, licence) | None, but reliance on each provider |
| Code to own | About 600 to 900 lines plus fixtures | Slotting logic plus glue | A mapping per provider |
Owner decision (23-10-2026): deferred until a provider is chosen, because the chosen provider may already decode reports well.
