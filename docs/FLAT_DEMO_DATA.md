# Whole-Flat Demo Data

**Simplified team demo assumptions / 團隊簡化示範假設.** This is inspired by Concord 1 Option 1, 2B, not an exact reconstruction, Housing Authority-certified measurement, or extraction from PDF pixels. (Housing Authority PDFs do have a metric scale bar, so a flat can be measured from one approximately: Read my floor plan does this for the user's own flat. The demo flat was not made that way.) Verify your own flat before purchase / 購買前請核實自己單位的尺寸.

Domain units are cm. X points right, Z points front to back, Y points up. All furniture positions are footprint centres at floor Y = 0. Positive rotation is clockwise on the X-right/Z-down plan; Three.js uses its negative Y angle. Stored angles are normalised to [0, 360).

## Envelope And Rooms

Envelope: 660 W x 640 D cm, 42.24 square metres gross. All walls are 10 cm thick. Shared ceiling height defaults to 260 cm, editable 220-350 cm for all rooms. There is no corridor. The bedrooms have equal assumed area; the names distinguish their use, not certified dimensions.

| Room ID | EN / Traditional Chinese | X range | Z range | W x D | Area (square metres) |
| --- | --- | --- | --- | --- | --- |
| living | Living / dining room / 客飯廳 | 10-420 | 10-330 | 410 x 320 | 13.12 |
| kitchen | Kitchen / 廚房 | 430-650 | 10-185 | 220 x 175 | 3.85 |
| bathroom | Bathroom / 浴室 | 430-650 | 195-330 | 220 x 135 | 2.97 |
| master | Master bedroom / 主人房 | 10-325 | 340-630 | 315 x 290 | 9.135 |
| second | Second bedroom / 睡房 | 335-650 | 340-630 | 315 x 290 | 9.135 |

Total assumed usable room area: 38.21 square metres. Walls occupy the intervening strips. All non-living rooms connect directly to living through doors, with no hidden hallway room.

## Wall Centre Lines

| ID | Start X/Z | End X/Z |
| --- | --- | --- |
| front-wall | 0 / 5 | 660 / 5 |
| back-wall | 0 / 635 | 660 / 635 |
| left-wall | 5 / 0 | 5 / 640 |
| right-wall | 655 / 0 | 655 / 640 |
| service-wall | 425 / 10 | 425 / 330 |
| bathroom-wall | 430 / 190 | 650 / 190 |
| bedroom-front-wall | 10 / 335 | 650 / 335 |
| bedroom-divider | 330 / 340 | 330 / 630 |

Collision wall rectangles are split at door openings. Windows are visual markings and do not split collision walls. No wall-distance constraint is imposed; touching a wall edge is allowed.

## Doors

| ID | Centre X/Z | Opening width | Wall | Swing into |
| --- | --- | --- | --- | --- |
| front-door | 365 / 5 | 80 | front-wall | living |
| kitchen-door | 425 / 110 | 80 | service-wall | kitchen |
| bathroom-door | 425 / 260 | 75 | service-wall | bathroom |
| master-door | 245 / 335 | 80 | bedroom-front-wall | master |
| second-door | 377.5 / 335 | 75 | bedroom-front-wall | second |

The hinge is the lower-coordinate opening end. A displayed quarter-turn door arc illustrates opening. Collision checking conservatively reserves an opening-width square just inside the swing room. This rectangular bounding zone can warn for space outside the true quarter-circle. It is a demo constraint, not a regulation, safety standard, doorway-passage analysis or delivery guarantee. The old sofa-table clear zone does not belong to this data.

## Windows (Visual Only)

| ID | Centre X/Z | Width | Sill height | Visual height | Wall |
| --- | --- | --- | --- | --- | --- |
| living-front-window | 210 / 5 | 150 | 100 | 90 | front-wall |
| living-side-window | 5 / 150 | 140 | 100 | 90 | left-wall |
| kitchen-window | 655 / 105 | 90 | 110 | 85 | right-wall |
| bathroom-window | 655 / 260 | 70 | 140 | 60 | right-wall |
| master-window | 165 / 635 | 150 | 100 | 90 | back-wall |
| second-window | 480 / 635 | 150 | 100 | 90 | back-wall |

Window sill and clearance, pipes, fixtures and skirting boards are not collision constraints. Windows are not delivery openings.

## Furniture

Since Revision 3 the flat starts empty, and these twenty items are the team's fixed suggested placements (`SUGGESTED_FURNITURE`), added per room or for the whole flat on request. Items start at 0 degrees except six turned so their furniture models face into the room (Revision 4): the TV console, north dining chair, fridge, vanity and second-bedroom desk at 180 degrees and the west dining chair at 90 degrees. Each turned footprint is identical to its 0-degree footprint. Once placed, every item is movable, rotatable, resizable and replaceable. The default scene has no position or distance locks. All sizes below are W x D x H in cm.

| ID | Room | Centre X/Z | Size | Angle |
| --- | --- | --- | --- | --- |
| living-sofa | living | 250 / 270 | 180 x 80 x 82 | 0 |
| living-coffee-table | living | 250 / 170 | 100 x 55 x 42 | 0 |
| living-tv | living | 235 / 40 | 160 x 40 x 50 | 180 |
| living-side-table | living | 370 / 270 | 40 x 40 x 45 | 0 |
| dining-table | living | 115 / 135 | 85 x 75 x 75 | 0 |
| dining-chair-north | living | 115 / 65 | 42 x 42 x 82 | 180 |
| dining-chair-south | living | 115 / 205 | 42 x 42 x 82 | 0 |
| dining-chair-west | living | 45 / 135 | 42 x 42 x 82 | 90 |
| kitchen-fridge | kitchen | 610 / 60 | 70 x 65 x 180 | 180 |
| kitchen-counter | kitchen | 600 / 140 | 100 x 60 x 90 | 0 |
| bathroom-toilet | bathroom | 610 / 275 | 55 x 65 x 80 | 0 |
| bathroom-vanity | bathroom | 605 / 215 | 80 x 35 x 85 | 180 |
| master-bed | master | 110 / 490 | 140 x 190 x 55 | 0 |
| master-wardrobe | master | 270 / 570 | 90 x 55 x 210 | 0 |
| master-desk | master | 255 / 460 | 100 x 50 x 75 | 0 |
| master-side-table | master | 200 / 560 | 40 x 40 x 45 | 0 |
| second-bed | second | 480 / 510 | 100 x 190 x 55 | 0 |
| second-wardrobe | second | 590 / 575 | 90 x 55 x 210 | 0 |
| second-desk | second | 585 / 375 | 110 x 50 x 75 | 180 |
| second-chair | second | 585 / 450 | 42 x 42 x 82 | 0 |

The library has 14 templates: sofa, coffee table, TV console, side table, dining table, chair, double/single bed, wardrobe, desk, counter, fridge, toilet and vanity. Template dimensions are the listed representative dimensions (desk defaults to 110 x 50 x 75). The master desk is an explicit 100 cm-wide preset variation.

## Reference

[Housing Authority typical floor plans](https://www.housingauthority.gov.hk/tc/global-elements/estate-locator/standard-block-typical-floor-plans/index.html)

[Concord 1 official PDF](https://www.housingauthority.gov.hk/common/pdf/global-elements/estate-locator/standard-block-typical-floor-plans/01-Concord1.pdf)

The PDF is a typical full-floor plan without reliable individual-flat dimensions. It is linked, not embedded or redistributed. Actual flats can differ. This is not professional, structural, accessibility or building-code advice.