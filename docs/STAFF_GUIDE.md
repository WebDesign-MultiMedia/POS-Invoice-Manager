# Staff Guide: POS Invoice Manager

A quick guide for the people who take orders and payments every day.
Open the app at **https://pos-invoice-manager.vercel.app** on the tablet, phone or computer.

> The pictures below come from the app's **demo mode**, which uses a made-up café. Your screens show the real menu and orders.

---

## 1. Log in

Type your **email or phone number** and your **password**, then press **Log in**.

- You stay logged in for 7 days on that device.
- If you see **"Your session expired. Please log in again."**, just log in. An order you were typing is still there.
- Forgot your password or need an account? Ask the manager. The manager adds staff accounts.
- **Try the demo** opens a practice copy with fake orders. Nothing in the demo is saved, charged or texted.

![Login screen](screenshots/login.webp)

## 2. Take an order

The home page is the order form.

1. Fill in **Name, Phone, Address, Type** (Delivery / Pick-up / Catering), **Cost, Payment** (Cash / Zelle) and **Deposit** (type `0` if none).
2. Write the **Items**, one per line or separated by commas. Write `2x` in front for quantities, e.g. `2x Taco de Chivo`.
3. **Due Date** and **Notes** are optional (use Due Date for catering).
4. Press **Submit Order** once. The button says **Saving…** while it works, and you'll see **Successfully Stored** when it's saved.

If the order **didn't save**, you'll see **"Order not saved"** and the form stays filled in. Check the internet and press Submit Order again.

<img src="screenshots/order-form-mobile.webp" alt="Order form on a phone" width="260">

## 3. Take a card payment

Tap the **card** button to open **Pay with Card**.

- **Charge Amount** is for walk-up sales. Tap menu items (or type an amount), add the customer's name if you like, then enter the card.
- **Pay Invoice** is for an existing order. Type the receipt number. Deposits and earlier card payments are already taken off.
- **Credit cards** add a card fee of up to 3%, and **debit cards** never do. The final total shows after the card is checked.
- Press **Pay** once and wait. The button is locked while the payment runs, so a customer can't be charged twice.
- When it's done you can **Text receipt** or open the receipt. **Charge another** clears everything for the next customer.

If you see **"Paid, but not added to the sheet"**, the customer *was* charged. Write down the Order ID shown and tell the manager.

![Card payment screen](screenshots/card-payment.webp)

## 4. Print or share an invoice

From a search result, press **Generate Invoice**. Then you can:

- **Print**: it always fits on one page.
- **Save as Image**: downloads a picture you can send.
- **Share**: copies a **read-only link** for the customer. They can see only that one invoice and can't change it.

To open a different invoice, tap the 🔍 next to **Receipt #** and type the number.

![Printable invoice](screenshots/invoice-print.webp)

## 5. Find an old order

Tap the **magnifying glass**. Choose **Search by** (Phone, Name, Address, Date, Month, Year, or Order ID for card payments), type, and press **Search**.

![Search results](screenshots/search-results.webp)

## 6. Text customers

Tap the **megaphone**. Type the message, then press **Text Specials Subscribers**.

- The page shows **how many customers are signed up** and the date of the **newest sign-up**. Press ↻ to refresh it.
- The owner can also get an **email for every new sign-up** if that's been switched on.

- Only customers who signed up for texts on the website get it. Anyone who replied STOP is skipped automatically.
- Every text starts with the restaurant's name and ends with "Reply STOP to unsubscribe."
- You'll be asked to confirm the number of customers first. **A text can't be unsent.**
- To take someone off the list by hand, write `Yes` in the **Unsubscribed** column of the **SMSSignups** tab in the sheet.

![Text customers](screenshots/broadcast.webp)

## 7. Shopping lists & receipts

Tap the **cart** button. You see it only if the owner ticked **Shopping lists** for you on the Team page.

**Got the list by text?** Anyone with Shopping lists can press **New shopping list**, open **Got the list by text? Paste it here**, paste the message and press **Make the list from this**. Put each store's name on its own line (e.g. `Restaurant Depot:` or `BJ's`) with its items under it; things in the catalog are matched by themselves. An employee's list is for them, and they can fix or delete it until the trip is finished.

**Making a list** (the owner, or someone with Shopping lists + **Can edit & delete**):

1. Press **New shopping list** and give it a name, e.g. *Restaurant Depot Friday*.
2. Pick **Who's buying**, or leave it as *Anyone with Shopping lists*.
3. Under **Where are they buying?**, tap every store on the trip (e.g. Restaurant Depot and Jetro), or type another one and press **Add**. Each store gets its own part of the list.
4. In each store's part, tap products from **the catalog** (tap again for one more), or type one thing per line (press Enter for the next). You can also paste a whole list someone texted you. **How many** and **About $** are optional.

**The product catalog** (managers): press **Product catalog** to add the things you buy all the time, with a picture, price, bin and item number. Pictures look best square with a see-through background (PNG or WebP). At the store, each item shows its picture and **bin number** so it's quick to find.

**At the store:**

- **Scan to be sure it's the right one:** press **Scan what you're picking** and point the phone at the product's barcode. The app finds it on the list and ticks it off, or tells you it isn't on the list. The small barcode button next to an item checks that one item: green means it's the right product, red means it's not. The first time a product without a barcode is scanned, the app offers to save its barcode. (The phone asks to use the camera the first time; allow it.)
- Tick each thing as you put it in the cart. If the store doesn't have it, press **None?** so it shows as *Out of stock*.
- Bought something that wasn't on the list? Add it under **Bought something not on the list?**
- Press **Scan receipt** and take a photo. On a trip to several stores, first pick which store the receipt is from; the app adds up all the receipts for the total. Lay it flat in good light. For a long receipt, take more than one photo.
- The app reads the photo and shows the store, date, items and total under it, and fills in **Receipt total** for you. Check it against the paper receipt before you finish.
- It also keeps the **catalog's prices up to date**: products on the receipt get the price actually paid (an empty price is filled in, a changed one is updated and the old price is kept in the note). The changes are listed under the receipt. That's why it helps to pick the right store before scanning.
- Type the **Receipt total** and press **Finish trip**. After that only a manager can change the list (or **Reopen** it).

Managers see every trip, its receipt photos and **Spent this month**. Employees see prices and totals only if **See shopping prices** is ticked for them.

## 8. If something goes wrong

| You see | What to do |
|---|---|
| "Couldn't reach the server…" | Check Wi-Fi or mobile data, then try again. Your typing is kept. |
| "Your session expired. Please log in again." | Log in. Your unsaved order comes back. |
| "Order not saved" | Press Submit Order again. Don't retype it, because it's still there. |
| "Payment failed" plus a card message (e.g. declined) | Ask for another card. **No charge was made.** |
| "Paid, but not added to the sheet" | The charge went through. Note the Order ID and tell the manager. |
| "Something went wrong" with a **Reload** button | Press Reload. A half-typed order is saved. |
| Anything else, or it keeps happening | Write down what you were doing and the message, and tell the manager. |
