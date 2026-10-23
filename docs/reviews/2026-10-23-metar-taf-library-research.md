# METAR and TAF decoding libraries: research record

Status: research result, 23-10-2026 (tracker YR-22). Registry and GitHub data checked with npm and the GitHub API; three npm packages were installed in a scratch directory outside the project (with install scripts disabled) and only imported to parse test strings. Python, Java, Go and Rust libraries were not run. Input to an owner decision; nothing is adopted yet.
Language: British English. Dates DD-MM-YYYY.

## Comparison
| Library | Language | Licence | Last release | Stars and open issues | Dependencies and size | METAR | TAF |
|---|---|---|---|---|---|---|---|
| metar-taf-parser (aeharding), npm metar-taf-parser | TypeScript, ESM | MIT | 9.1.3, 17-03-2026 | 65 and 7 | none; 262 KB unpacked with locales | Full | Full, plus a forecast helper |
| aewx-metar-parser (fboes) | JavaScript | MIT | 3.0.2, 24-08-2026 | 23 and 1 | none; 77 KB | METAR only | None |
| metar (skydivejkl) | JavaScript | MIT | 1.0.0, 19-06-2022 (abandoned) | repository not found | none | METAR only | None |
| metar-decoder, metar-parser, taf-parser (npm) | JavaScript | ISC or MIT | 2022 | not checked | various | Basic | None or experimental |
| python-metar-taf-parser (mivek) | Python | MIT | 1.13.1, 31-05-2026 | 67 and 7 | n/a | Full | Full |
| MetarParser (mivek) | Java | MIT | 3.1.3, 22-10-2026 | 52 and 6 | n/a | Full | Full |
| avwx-engine | Python | MIT | 1.9.10, 18-10-2026 | 124 and 14 | n/a | Full | Full |
| python-metar | Python | licence not confirmed | 2.0.1, 20-03-2026 | 306 and 36 | n/a | METAR only | None |

Avoid `@squawk/weather`: a web search flagged versions 0.5.6 to 0.5.8 as compromised in a supply-chain attack; not installed or verified.

The only maintained, typed, zero-dependency, browser-ready JavaScript or TypeScript library covering both METAR and TAF found is metar-taf-parser, a port of mivek's Python library. The other JavaScript libraries are METAR-only or abandoned.

## Test results for metar-taf-parser 9.1.3
Decoded correctly: the YSSY METAR (wind, gust, visibility, cloud, temperature, QNH); the YSSY TAF with FM and TEMPO, with validity resolved to real dates; PROB40 TEMPO and PROB30 TEMPO; a bare PROB30; BECMG with VRB05KT; INTER; a TEMPO group with no content; month rollover (301100Z crossing into November) and hour 24; TAF AMD, COR and CNL; a US METAR with statute miles and inHg and remarks; fractional visibility; METARs in m/s including CAVOK; a wind range (220V290); VCSH, NSC and NSW; a corrected METAR.
- `parseTAFAsForecast` returns a flat list of time-bounded entries, close to the slot structure needed. An FM entry carries only the fields in its own group, so visibility and cloud do not carry forward and the slot builder must inherit them.
Did not decode correctly:
- A NIL TAF throws "Invalid weather string" and must be caught.
- A `///015` cloud group is silently ignored with no warning (a `FEW030///` is accepted with the type dropped).
- Recent weather (RE, for example RERA) is not decoded.
- Units are returned as tagged (m/s, statute miles, inHg); conversion to knots, metres and hPa is ours to do.
Open issues of interest: #101 variable winds fail to parse (not reproduced with 220V290); #76 an error in the composite forecast helper; #74 runway state groups; #124 a visibility parse error.

## Recommendation (the researcher's)
Use metar-taf-parser behind a thin adapter of our own, pinned to an exact version, vendorable if the maintainer stops (MIT; the logic is much smaller than the locale files). We write: NIL handling; the 30-minute slot builder with TEMPO and PROB handling and FM inheritance of visibility and cloud; unit conversion; warnings for silently dropped groups; the RE group; and a regression set of 30 to 50 real reports from many airports (fixtures from mivek's repositories, avwx-engine and python-metar are candidates; licences to be checked before copying).
- Effort with the library: about 1.5 to 3 days (adapter, slot builder, unit normalisation, NIL and error handling, fixtures).
- Effort for our own parser: about 8 to 15 days for the same coverage (grammar, validity and rollover logic, international variants, a corpus large enough to trust), using the Python library's grammar and fixtures as the specification.
- Fallback: vendor the library into the repository and patch it, about 1 to 2 extra days.
- Unverified: bundle size after tree-shaking; behaviour of the composite forecast helper with FM groups; behaviour on the open-issue formats.

## Owner decision needed
Using the library adds one runtime dependency, which DESIGN.md requires the owner to approve (together with the schema library already approved).
