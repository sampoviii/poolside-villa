# Poolside Villa — Web-Based Resort Reservation and Management System

A full-stack web-based reservation and management system developed for **Poolside Villa** (Pansol, Calamba City, Laguna) as our Software Engineering 2 capstone project at **City College of Calamba**. 

The system replaces manual booking methods (social media inquiries, handwritten logs, and whiteboard schedules) with a centralized digital platform featuring real-time availability tracking, payment proof verification, role-based portals, and descriptive data analytics.

---

## ✨ Key Features

### 👤 Customer Portal
* **Account Management:** Secure registration, login, and email verification code password recovery.
* **Real-Time Availability & Booking:** Interactive calendar with 15-minute temporary date locks (`date_locks`) to prevent double-booking overlaps, automated package/pax rate calculation, and optional LPG add-ons.
* **GCash Payment & Proof Submission:** Displays dynamic resort GCash details and QR code with receipt screenshot upload and reference number tracking.
* **Booking Tracking & Receipts:** Real-time reservation history, in-app notifications, and automated status emails with downloadable PDF receipts upon approval.
* **Verified Reviews:** Post-stay rating and review system for completed, approved bookings.

### 🛠️ Caretaker / Staff Portal
* **Daily Operations Dashboard:** View today's guest schedule, pending reservations, and upcoming bookings.
* **Payment Verification:** Inspect customer-uploaded GCash receipts and approve or decline reservation requests with optional custom messages.
* **Schedule & Balance Management:** Monitor available/reserved dates, block walk-in dates to keep online availability accurate, and record walk-in balance payments at check-in.

### 👑 Admin / Owner Portal
* **Descriptive Analytics Dashboard:** Displays KPI summary cards (total reservations, pending verifications, down payments, total earnings) and a visual monthly reservation trend chart.
* **Transaction Reports:** Generate monthly or yearly reservation reports and export them in **CSV** or **PDF** formats.
* **System & User Administration:** Create and manage caretaker accounts, moderate customer reviews, update dynamic GCash number/QR code settings, and track system activities via **Audit Logs**.
* **Data Privacy Compliance:** Built with Role-Based Access Control (RBAC) and user consent workflows aligned with the **Data Privacy Act of 2012 (RA 10173)**.
