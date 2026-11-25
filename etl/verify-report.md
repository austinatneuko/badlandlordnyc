# Accuracy checks

## 1. Open HPD violations, 20 random buildings

| BBL | Address | Ours | HPD data live | Who Owns What |
|---|---|---|---|---|
| 3082800034 | 1493 East 96 Street | 18 | 18 | 18 |
| 3013850055 | 1443 Lincoln Place | 2 | 2 | 2 |
| 3057000045 | 875 59 Street | 7 | 7 | 7 |
| 3001830032 | 396 Atlantic Avenue | 12 | 12 | 12 |
| 3006370019 | 198 19 Street | 11 | 11 | 11 |
| 3056810003 | 5517 Ft Hamilton Parkway | 1 | 1 | 1 |
| 3073780001 | 2201 East 17 Street | 1 | 1 | 1 |
| 3058640026 | 446 68 Street | 51 | 51 | 51 |
| 3012090068 | 1367 Dean Street | 1 | 1 | 1 |
| 3051560058 | 385 Argyle Road | 78 | 78 | 78 |
| 3035870013 | 795 Thomas S Boyland St | 36 | 36 | 36 |
| 3039250021 | 111 Cleveland Street | 27 | 27 | None |
| 3013400014 | 1546 Pacific Street | 18 | 18 | 18 |
| 3067370064 | 1705 Elm Avenue | 11 | 11 | 11 |
| 3033800020 | 26 Cornelia Street | 7 | 7 | 7 |
| 3033030032 | 441 Bleecker Street | 42 | 42 | 42 |
| 3070220005 | 3703 Neptune Avenue | 34 | 34 | 34 |
| 3088300090 | 2322 Plumb 1 Street | 2 | 2 | 2 |
| 3047730050 | 725 East 52 Street | 7 | 7 | 7 |
| 3017620024 | 923 Bedford Avenue | 13 | 13 | 13 |

Matches the live HPD count: **20/20** (PASS). Who Owns What refreshes on its own schedule, so small gaps there are refresh lag.

## 2. Owner portfolios vs Who Owns What (Brooklyn buildings only)

| Owner | Ours | Who Owns What | Diff | Pass |
|---|---|---|---|---|
| Andy Pitsillos | 10 | 10 | 0% | yes |
| Anthony Musto | 53 | 19 | 179% | no |
| Eleizer Schwimer | 19 | 19 | 0% | yes |
| Oksana Masliy | 15 | 15 | 0% | yes |
| Mayer Brach | 12 | 14 | 14% | no |
| Joseph Brunner | 26 | 34 | 24% | no |
| Nicholas Kotsonis | 29 | 30 | 3% | yes |
| Efstathios Valiotis | 23 | 25 | 8% | yes |
| Shulem Berger | 42 | 56 | 25% | no |
| Anna Smagacz | 10 | 10 | 0% | yes |

Within 10%: **6/10** (FAIL)

## 3. Public Advocate Worst Landlords Watchlist, 15 Brooklyn buildings

| Address | Watchlist avg open violations | Our percentile | Worst 10%? |
|---|---|---|---|
| 229 East 18 Street | 777 | 98.4 | yes |
| 1593 Fulton Street | 679 | 85.0 | no |
| 912 Linden Boulevard | 613 | 99.8 | yes |
| 8501 Ft Hamilton Parkway | 609 | 99.2 | yes |
| 381 Vernon Avenue | 456 | 100.0 | yes |
| 553 Howard Avenue | 450 | 99.9 | yes |
| 2298 Atlantic Avenue | 449 | 100.0 | yes |
| 6823 Ridge Boulevard | 446 | 99.5 | yes |
| 564 Bradford Street | 425 | 100.0 | yes |
| 563 New Lots Avenue | 391 | 100.0 | yes |
| 1588 Eastern Parkway Extension | 376 | 100.0 | yes |
| 509 Hinsdale Street | 372 | 99.3 | yes |
| 930 Prospect Place | 364 | 99.6 | yes |
| 1740 Nostrand Avenue | 356 | 100.0 | yes |
| 846 Prospect Place | 348 | 98.6 | yes |

In our worst 10%: **14/15** (PASS)
