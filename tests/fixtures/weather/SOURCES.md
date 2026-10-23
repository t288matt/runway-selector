# Weather report fixtures: sources

Every string in `reports.json` was copied from a public source on the date shown; none was written by us. Each entry also carries a synthetic clock (`nowUtc`) that the tests use as "now": the clock is invented, the report text is not.

Sources used:

- NOAA/NWS Aviation Weather Center (AWC), all-current cache files and data API. AWC publishes no licence for the report text; it is a US Government public data service, used here within its published guidelines (cache files rather than bulk API calls, a custom user agent). The reports originate from the national weather services of each country (exchanged under WMO rules). Fixtures are kept as small excerpts for testing only.
- aeharding/metar-taf-parser test suite and mivek/python-metar-taf-parser test suite (both MIT licence). These strings are published examples in a test suite; upstream does not say whether each is a verbatim live report, so they are marked as such.
- Not sourced: a NIL TAF (for example "TAF XXXX 231100Z NIL"). None was available in the AWC data at retrieval time and none is in the two test suites; the NIL TAF path is tested with a clearly marked synthetic string in the test file, not in this list.

| id | kind | station | country | source | retrieved | licence |
|---|---|---|---|---|---|---|
| metar-yssy-auto-nodata | METAR | YSSY | Australia | https://aviationweather.gov/api/data/metar?ids=YSSY&format=raw | 23-10-2026 | No licence file. |
| metar-kjfk-sm-inhg | METAR | KJFK | USA | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-egll-cloud-unknown-type | METAR | EGLL | United Kingdom | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-uibb-mps-range | METAR | UIBB | Russia | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-skbu-vrb-re | METAR | SKBU | Colombia | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-zhhh-mps-cavok | METAR | ZHHH | China | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-waqq-calm | METAR | WAQQ | Indonesia | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-nzaa-cloud-slashes | METAR | NZAA | New Zealand | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-rjcc-vrb | METAR | RJCC | Japan | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-cybw-speci-snow | METAR | CYBW | Canada | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-kues-speci-fog | METAR | KUES | USA | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-espa-cor | METAR | ESPA | Sweden | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| taf-khlg-fm-mid-slot | TAF | KHLG | USA | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| metar-eddh-tempo-trend | METAR | EDDH | Germany | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-kdlh-sixteenth | METAR | KDLH | USA | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-loan-no-data | METAR | LOAN | Austria | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-hkel-showers-re | METAR | HKEL | Kenya | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-usdd-speci-mps-gust-range | METAR | USDD | Russia | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |
| metar-svmc-nil | METAR | SVMC | Venezuela | https://github.com/aeharding/metar-taf-parser/blob/main/tests/parser/parser.test.ts | 23-10-2026 | MIT (copyright the metar-taf-parser authors). |
| taf-yssy-multiline-fm-tempo | TAF | YSSY | Australia | https://aviationweather.gov/api/data/taf?ids=YSSY&format=raw | 23-10-2026 | No licence file. |
| taf-ymml-multiline-amd-inter | TAF | YMML | Australia | https://aviationweather.gov/api/data/taf?ids=YMML&format=raw | 23-10-2026 | No licence file. |
| taf-kjfk-fm-statute-miles | TAF | KJFK | USA | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-limc-prob40-tempo | TAF | LIMC | Italy | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-edhi-prob30-tempo | TAF | EDHI | Germany | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-ypcc-inter | TAF | YPCC | Cocos Islands (Australia) | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-nvss-prob40-inter | TAF | NVSS | Vanuatu | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-essv-prob40-plain | TAF | ESSV | Sweden | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-essl-prob40-showers | TAF | ESSL | Sweden | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-fbsk-becmg-hour24 | TAF | FBSK | Botswana | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-uauu-mps-vrb | TAF | UAUU | Kazakhstan | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-urwa-mps-gust | TAF | URWA | Russia | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-ybbn-amd-prob30-tempo | TAF | YBBN | Australia | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-mmmx-cor | TAF | MMMX | Mexico | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-kaff-wnd-qnh-ins | TAF | KAFF | USA | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-dngo-glued-becmg | TAF | DNGO | Nigeria | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-egkk-becmg-tempo-prob | TAF | EGKK | United Kingdom | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-cwwu-mixed-fraction | TAF | CWWU | Canada | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-oitl-prob-no-period | TAF | OITL | Iran | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-oing-typo-cloud | TAF | OING | Iran | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-klan-vv-tempo | TAF | KLAN | USA | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-encn-becmg-rain | TAF | ENCN | Norway | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-sccy-tempo-vrb | TAF | SCCY | Chile | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-czbf-day30-amd-nautical | TAF | CZBF | Canada | https://github.com/aeharding/metar-taf-parser/blob/main/tests/parser/parser.test.ts | 23-10-2026 | MIT (copyright the metar-taf-parser authors). |
| taf-kmsn-month-rollover-hour24 | TAF | KMSN | USA | https://github.com/aeharding/metar-taf-parser/blob/main/tests/forecast/forecast.test.ts | 23-10-2026 | MIT (copyright the metar-taf-parser authors). |
| taf-eham-month-rollover-becmg | TAF | EHAM | Netherlands | https://github.com/aeharding/metar-taf-parser/blob/main/tests/forecast/forecast.test.ts | 23-10-2026 | MIT (copyright the metar-taf-parser authors). |
| taf-vtbd-cancelled | TAF | VTBD | Thailand | https://github.com/aeharding/metar-taf-parser/blob/main/tests/parser/parser.test.ts | 23-10-2026 | MIT (copyright the metar-taf-parser authors). |
| taf-fzic-fm-with-space | TAF | FZIC | DR Congo | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-mdpp-two-tafs-joined | TAF | MDPP | Dominican Republic | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| taf-kngu-no-issue-time | TAF | KNGU | USA | https://aviationweather.gov/data/cache/tafs.cache.xml.gz | 23-10-2026 | No licence file. |
| metar-dgsi-free-text | METAR | DGSI | Ghana | https://aviationweather.gov/data/cache/metars.cache.csv.gz | 23-10-2026 | No licence file. |

50 fixtures (19 METAR, 31 TAF).
