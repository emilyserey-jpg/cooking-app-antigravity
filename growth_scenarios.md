# In The Loop: Growth Scenarios & Stress Tests

This document contains the detailed financial growth scenarios, user behavior stress tests, and server cost projections for **In The Loop**. It models how revenues and technical expenses (COGS) scale from a small beta launch to a commercial scale under different user profiles and safety caps.

---

## 1. How We Bring in Revenue (Inflows)
We monetize users through five main B2C and B2B commerce channels:

1.  **Chef Premium Subscriptions (B2C)**: Home cooks pay **$4.99/month** for unlimited AI imports, private video cloud storage, ad-free kitchen mode, and hands-free voice commands.
2.  **Display Pageview Ads**: Display ads inside the split-screen cooking dashboard and recipe browsing cards, monetized at a **$20.00 RPM** (2 cents per pageview; average user cooks 30 times/mo = **$0.60/user/mo**).
3.  **Grocery Affiliate Commissions**: A **1%–3% commission** paid by grocery partners (Amazon Fresh, Instacart) when a user clicks "Order Ingredients" and checks out a recipe cart (averages **$0.06/user/mo** across the community).
4.  **Hardware & Cookware Affiliates**: In-context links in recipe steps (e.g., "Use a 12-inch Cast Iron Skillet") earning Amazon Associates affiliate commissions.
5.  **B2B Sponsored Ingredients (Future)**: Brands pay to be the default recommended brand in grocery checkouts (e.g., Barilla Pasta or Philadelphia Cream Cheese).

---

## 2. Infrastructure & Operations Expenses (Outflows)
Our cost of goods sold (COGS) to run the application consists of five main bills:

1.  **AI API Compute (Replicate & Gemini)**: Speech-to-text transcription (Whisper) and text step structuring (Gemini 2.5 Flash), costing **$0.02** (2 cents) per run.
2.  **Cloud Storage Warehouse Rent (Cloudflare R2)**: Storage rent for raw uploaded videos, costing **$0.015 per GB** per month.
3.  **Authentication & User Databases (Supabase Auth)**: Supabase handles secure logins and hosts profile data, recipe text, and folders. Its authentication service is completely free up to **50,000 Monthly Active Users** (MAU), then scales on flat plans.
4.  **Credit Card Transaction Fees (Stripe)**: Fees for B2C subscriptions costing **2.9% + $0.30** (deducts **$0.44** from every $4.99 sub, leaving **$4.55** net).
5.  **Egress Bandwidth (Data Delivery)**: Bypassed entirely (**$0.00/GB**) by routing video streaming through **Cloudflare R2**.

---

## 3. The 1,000 MAU Bootstrapping Scenarios
This models three different setups at a small scale of 1,000 Monthly Active Users (MAU).

### Scenario 1: The Danger Zone (No Caps, No Compression)
*   *Setup*: Free users have unlimited uploads and uncapped AI runs. Videos are hosted on Supabase storage (paying egress).
*   *Revenues ($600)*: Ads only (1,000 × $0.60).
*   *Expenses ($298)*: Uncapped AI runs ($200) + Supabase 9-cent egress fees on uncompressed videos ($98).
*   *Net Monthly Profit*: **+$302** (50.3% Gross Margin).
*   *Risk*: High. A single viral video will run up egress fees that exceed total ad revenue.

### Scenario 2: Capped & Compressed (Safe Bootstrapping)
*   *Setup*: Free users are capped at 3 AI imports/month. Video uploads are compressed to 10MB and hosted on Cloudflare R2 (zero egress fees).
*   *Revenues ($660)*: Ads ($600) + Grocery Commissions ($60).
*   *Expenses ($31)*: Capped AI runs ($30) + compressed Cloudflare R2 storage rent ($1).
*   *Net Monthly Profit*: **+$629** (95.3% Gross Margin).

### Scenario 3: Freemium & Embeds (The Instagram Hybrid)
*   *Setup*: Scenario 2 controls + 5% conversion rate to Chef Premium ($4.99/mo). Free users use YouTube/TikTok embeds where possible.
*   *Revenues ($910)*: Ads ($570) + Grocery Commissions ($60) + 50 Premium subscribers ($250 net).
*   *Expenses ($22)*: Premium AI runs ($20) + embeds video storage ($2).
*   *Net Monthly Profit*: **+$888** (97.6% Gross Margin).

---

## 4. Alternate Scenario Modeling (How the Money Can Go)

### Scenario A: The Grocery Affiliate Boom (High Checkout, Low Subscriptions)
*   *What happens*: Only 1% of users subscribe to Chef Premium, but grocery checkouts go viral. 15% of your users check out their carts via Amazon Fresh or Instacart every week (earning a $2.00 commission per checkout).
*   *Monthly Income (1,000 MAU)*: 
    *   Ads: $600
    *   Grocery Referrals (600 checkouts × $2.00): $1,200
    *   Subscriptions (10 users × $4.55): $45
    *   **Total Revenues: $1,845**
*   *Monthly Expenses*: AI runs ($15) + R2 storage ($2) = **$17**.
*   *Net Profit*: **+$1,828/month** (a **99% Gross Margin**).
*   *Insight*: Proves that the business doesn't need high subscription rates to be highly profitable; affiliate checkouts are a powerful revenue engine.

### Scenario B: The Uncompressed Video Heavy Creator (No Size Restrictions)
*   *What happens*: You do not enforce video compression on uploads. Users upload high-definition 1080p clips directly (averaging 200MB per video instead of our compressed 10MB).
*   *Monthly Income (1,000 MAU)*: $910 (Scenario 3 baseline).
*   *Monthly Expenses*: 
    *   Storage Rent: Instead of $2.00, hosting 500 uncompressed videos (100 GB) costs **$15.00/mo** in storage rent.
    *   API processing: Replicate Whisper costs double (**$0.04/run**) to transcribe heavy audio files = **$40.00**.
    *   **Total Expenses: $55.00/mo**.
*   *Net Profit*: **+$855/month** (Gross margin drops from 97% to 93.9%).
*   *Insight*: While still highly profitable, this illustrates why enforcing **server-side compression and upload caps** is essential to prevent cost leakage.

### Scenario C: The Influencer Viral Spill (1 Million Video Plays in 24 Hours)
*   *What happens*: A famous chef mentions a recipe link on Instagram, bringing a sudden spike of 1,000,000 video plays in a single day.
*   *If hosted on Supabase Storage ($0.09/GB egress)*:
    *   1,000,000 streams × 10MB compressed video = 10,000 GB (10 Terabytes) of egress.
    *   **Your Egress Bill: $900.00 in one day** (Wipes out your monthly profits).
*   *If hosted on Cloudflare R2 ($0.00/GB egress)*:
    *   1,000,000 streams × 10MB = 10,000 GB of egress.
    *   **Your Egress Bill: $0.00** (You pocket 100% of the ad revenues from the viral views).
*   *Insight*: Cloudflare R2 is a non-negotiable security requirement. It acts as our armor against virality.

---

## 5. The Premium Tier Subsidization Math
This models the financial coverage between a paying user and a free user.

*   **Free User Cost**: **$0.015/month** (database overhead + basic storage).
*   **Premium Subscriber Profit**: **$4.14/month** (after card fees and AI costs).
*   **The Subsidization Ratio**: `4.14 / 0.015 =` **276 Free Users**.
*   **Breakeven Threshold**: You only need **1 out of every 276 users (0.36%)** to upgrade to Premium for the server bills of the entire app to be paid.
