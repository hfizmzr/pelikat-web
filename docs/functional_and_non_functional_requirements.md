

| Organizer Management |  |
| :---- | :---- |
| ID | Requirement |
| FR-01 | The system shall allow the Super-Admin to create new organizer tenant accounts with a unique slug/subdomain label. |
| FR-02 | The system shall allow the Super-Admin to activate or deactivate organizer tenants and manage their subscription validity. |
| FR-03 | The system shall display a searchable, filterable, and sortable data table of all tenants with active/inactive status badges. |

| Subscription Management (1 Tier) |  |
| :---- | :---- |
| ID | Requirement |
| FR-04 | The system shall allow the Super-Admin to set and edit the subscription expires\_at date for each organizer. |
| FR-05 | The system shall automatically block an inactive organizer from accessing all platform routes, returning a 403 response. |
| FR-06 | The system shall display an aggregate count of total active tenants on the admin dashboard. |

| Admin Dashboard |  |
| :---- | :---- |
| ID | Requirement |
| FR-07 | The system shall provide a read-only aggregate view of total organizers, total events, and total runners across all tenants. |
| FR-08 | The system shall display a paginated audit log of organizer login/logout activity with timestamp filtering. |

| Event Builder & Category Engine |  |
| :---- | :---- |
| ID | Requirement |
| FR-9 | The system shall allow organizers to create an event specifying name, date, location, and available distances. |
| FR-10 | The system shall allow organizers to define race categories (e.g., Open, Veteran, Junior) with age-band and gender rules. |
| FR-11 | The system shall auto-generate sequential BIB numbers per (event\_id, category) starting from the next available number. |
| FR-12 | The system shall allow organizers to set and manage registration open and close dates for each event. |
| FR-13 | The system shall support an event status lifecycle: draft, published, and closed. |

| AI Photo Engine (CORE) |  |
| :---- | :---- |
| ID | Requirement |
| FR-15 | The system shall allow organizers/photographers to bulk-upload race photos via drag-and-drop to supabase storage. |
| FR-16 | The system shall process uploaded photos through a background pipeline using YOLOv26 to detect bib regions. |
| FR-17 | The system shall extract bib numbers from detected regions using PaddleOCR. |
| FR-18 | The system shall auto-tag a photo to the matching runner in the database when OCR confidence is greater than 0.85. |
| FR-19 | The system shall flag photos with OCR confidence between 0.50 and 0.85 for manual organizer review. |
| FR-20 | The system shall display per-upload-batch processing status and statistics (auto-tagged, flagged, failed counts). |
| FR-21 | The system shall provide a review queue UI for organizers to manually correct flagged photo tags. |

| REPC & QR Check-In (incl. Proxy Collection) |  |
| :---- | :---- |
| ID | Requirement |
| FR-22 | The system shall generate a unique digital BIB with an embedded QR code per runner per event. |
| FR-23 | The system shall allow staff to scan a runner's QR code at the REPC collection point to mark them as checked-in. |
| FR-24 | The system shall enforce idempotency by preventing duplicate check-ins for the same runner and event. |
| FR-25 | The system shall track shirt size inventory (S/M/L/XL) and decrement counts in real-time upon successful check-in. |
| FR-26 | The system shall validate the consent code and the collector's QR identity at the REPC point for proxy collection. |
| FR-27 | The system shall log proxy collection with the collector's identity, the absent runner's identity, and a timestamp. |
| FR-28 | The system shall expire the consent code after 24 hours or upon first use, whichever occurs first. |

| Notification & Engagement |  |
| :---- | :---- |
| ID | Requirement |
| FR-29 | The system shall send an automated transactional email to the runner upon successful registration, including their BIB number. |
| FR-30 | The system shall send an automated transactional email to the runner when results or the leaderboard are published. |
| FR-31 | The system shall deliver push notifications to PWA users via the Web Push Protocol (VAPID) on iOS 16.4+ and Android Chrome. |

| Analytics Dashboard |  |
| :---- | :---- |
| ID | Requirement |
| FR-33 | The system shall display registration counts broken down by race category and gender. |
| FR-34 | The system shall calculate and display the check-in rate as a percentage of checked-in runners versus total registered. |
| FR-35 | The system shall display a shirt size distribution chart for the event. |
| FR-36 | The system shall display a basic demographic breakdown of runners by age group. |

| Merch Hub Manager |  |
| :---- | :---- |
| ID | Requirement |
| FR-37 | The system shall allow organizers to create product listings with name, description, price, size variants, and image upload. |
| FR-38 | The system shall allow organizers to set and manage stock quantity per variant, with a low-stock warning indicator. |
| FR-39 | The system shall display a filterable order management table showing runner orders by status (pending, confirmed, collected). |
| FR-40 | The system shall allow organizers to mark individual or bulk orders as fulfilled/ready for collection. |
| FR-41 | The system shall display a sales summary with total revenue and total items sold per product. |

| Smart Profile & Registration (Google OAuth \+ IC/Passport) |  |
| :---- | :---- |
| ID | Requirement |
| FR-42 | The system shall allow runners to sign up and log in using Google OAuth 2.0 without requiring a platform password. |
| FR-43 | The system shall enforce a profile completion phase capturing full name, IC/Passport, DOB, gender, phone, and emergency contact. |
| FR-44 | The system shall require runners to provide explicit PDPA consent via checkbox with privacy policy link before saving their profile. |
| FR-45 | The system shall store the IC/Passport field encrypted using AES-256-CBC at the application level before writing to the database. |
| FR-46 | The system shall allow one-click re-registration for future events using previously saved profile data. |
| FR-47 | The system shall display a "My Events" dashboard listing all registered events with their current status. |
| FR-48 | The system shall allow runners to delete their account, triggering a PDPA erasure flow that anonymizes the IC/Passport field. |

| Race Day Toolkit (Digital BIB) |  |
| :---- | :---- |
| ID | Requirement |
| FR-50 | The system shall display a digital BIB card containing the runner's name, race category, and a scannable QR code. |
| FR-51 | The system shall display the runner's latest check-in status on the digital BIB after the server confirms a REPC scan. |
| FR-52 | The system shall allow runners to request, copy, or share a proxy collection consent code from the digital BIB page. |
| FR-53 | The system shall display the current status of the consent code (active, used, or expired). |

| AI Personal Gallery (Find My Photos) |  |
| :---- | :---- |
| ID | Requirement |
| FR-56 | The system shall display a personal gallery containing only photos where the runner's BIB number was detected. |
| FR-57 | The system shall allow runners to filter their photo gallery by race event. |
| FR-58 | The system shall allow runners to download individual photos. |
| FR-59 | The system shall allow runners to report a mis-tagged photo, sending it to the organizer's manual review queue. |

| Virtual Run Tracker \+ Gamification \+ Badges |  |
| :---- | :---- |
| ID | Requirement |
| FR-60 | The system shall allow runners to log a virtual run by submitting distance (km), time (minutes), and date. |
| FR-61 | The system shall calculate and display pace (min/km) based on submitted distance and time, validated server-side. |
| FR-62 | The system shall auto-award badges upon run submission based on predefined rules (e.g., First Run, 5K, 10K, Consistent Runner). |
| FR-63 | The system shall generate a finisher e-certificate as a downloadable PNG image with event template overlay. |

| Leaderboard |  |
| :---- | :---- |
| ID | Requirement |
| FR-67 | The system shall display rankings by race category, showing rank, BIB number, name, and finish time/pace. |
| FR-68 | The system shall highlight the logged-in runner's personal rank row in the leaderboard table. |
| FR-69 | The system shall restrict leaderboard visibility until the organizer explicitly publishes the results. |

| Merch Store |  |
| :---- | :---- |
| ID | Requirement |
| FR-70 | The system shall allow runners to browse merchandise listings available for their registered event. |
| FR-71 | The system shall allow runners to add items to a cart, selecting size/variant and quantity. |
| FR-72 | The system shall process checkout via an integrated payment gateway supporting FPX and credit card. |
| FR-73 | The system shall generate an order confirmation with a unique order number upon successful payment. |
| FR-74 | The system shall display order status (pending, confirmed, ready to collect at REPC) in the runner's order history. |