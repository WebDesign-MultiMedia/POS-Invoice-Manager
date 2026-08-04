import { useState } from "react";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import { submitOrder } from "../api/sheetdb.js";
import { getCurrentDateTime } from "../lib/format.js";

const INITIAL_FORM = {
  Name: "",
  Contact: "",
  Address: "",
  PickupDelivery: "",
  Cost: "",
  Payment: "",
  Deposit: "",
  Items: "",
  Quantity: "1",
};

const ALERT_BASE = {
  showDenyButton: false,
  showConfirmButton: false,
  theme: "dark",
  backdrop: `
    rgba(9, 8, 9, 0.87)
    left top
    no-repeat
  `,
};

function fieldClass(value, validated) {
  if (!validated) return "input-3d text-center";
  return value.trim() ? "input-3d text-center field-valid" : "input-3d text-center field-error";
}

export default function OrderFormPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [validated, setValidated] = useState(false);

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { date, time } = getCurrentDateTime();
    const data = {
      Date: date,
      Time: time,
      Name: form.Name,
      Contact: form.Contact,
      Address: form.Address,
      PickupDelivery: form.PickupDelivery,
      Items: form.Items,
      Quantity: form.Quantity,
      Cost: form.Cost,
      Deposit: form.Deposit,
      Payment: form.Payment,
    };

    const hasBlank = Object.values(data).some((v) => !v);

    if (hasBlank) {
      setValidated(true);
      Swal.fire({ ...ALERT_BASE, title: "Fill in Blanks", icon: "error", timer: 1000 });
      return;
    }

    Swal.fire({ ...ALERT_BASE, title: "Successfullyy Stored", icon: "success", timer: 1500 });

    try {
      await submitOrder(data);
    } catch (err) {
      console.error(err.message);
    }

    setForm(INITIAL_FORM);
    setValidated(false);
  };

  const navLinks = (
    <>
      <NavFab
        href="https://docs.google.com/spreadsheets/d/1foMCHxncVcHoJQwxRVPxTM3o64zIDyUJZErwtLLu5qo/edit?usp=sharing"
        external
        title="Open spreadsheet"
        icon="fa-file-excel"
        colorClass="text-brand-teal"
        glowClass="shadow-glow-teal"
      />
      <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
      <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
      <NavFab to="/updates" title="What's new" icon="fa-wand-magic-sparkles" colorClass="text-brand-pink" glowClass="shadow-glow-pink" />
    </>
  );

  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-cactus w-80 h-80 top-1/3 -right-16 animate-float", "bg-brand-pink w-64 h-64 bottom-0 left-1/4 animate-float-slow"]}>
      <PageHeader logoSize="w-20 h-20" title="Buffet Lucia Fiesta Mexicana" subtitle="Auténtica Comida Mexicana • Order Tracker" />

      <NavRow className="mb-8">{navLinks}</NavRow>

      <TiltCard maxDeg={3} as="form" wrapClassName="w-full max-w-3xl" className="glass-card p-6 sm:p-10 stagger-in" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 mb-6 justify-center">
          <i className="fa-solid fa-utensils text-brand-gold text-xl"></i>
          <h2 className="text-xl sm:text-2xl font-semibold text-brand-navy">Customer Order</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <div className="field-group">
            <label htmlFor="Name" className="field-label">
              <i className="fa-solid fa-user"></i> Name
            </label>
            <input type="text" name="Name" id="Name" placeholder="Customer name" className={fieldClass(form.Name, validated)} value={form.Name} onChange={setField("Name")} />
          </div>
          <div className="field-group">
            <label htmlFor="Contact" className="field-label">
              <i className="fa-solid fa-phone"></i> Phone
            </label>
            <input type="text" name="Contact" id="Contact" placeholder="Customer phone" className={fieldClass(form.Contact, validated)} value={form.Contact} onChange={setField("Contact")} />
          </div>
          <div className="field-group">
            <label htmlFor="Address" className="field-label">
              <i className="fa-solid fa-location-dot"></i> Address
            </label>
            <input type="text" name="Address" id="Address" placeholder="Customer address" className={fieldClass(form.Address, validated)} value={form.Address} onChange={setField("Address")} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="field-group">
            <label htmlFor="PickupDelivery" className="field-label">
              <i className="fa-solid fa-truck-fast"></i> Type
            </label>
            <select name="PickupDelivery" id="PickupDelivery" className={fieldClass(form.PickupDelivery, validated)} value={form.PickupDelivery} onChange={setField("PickupDelivery")}>
              <option value="">Type</option>
              <option value="Delivery">Delivery</option>
              <option value="Pick-up">Pick-up</option>
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="Cost" className="field-label">
              <i className="fa-solid fa-dollar-sign"></i> Cost
            </label>
            <input type="text" name="Cost" id="Cost" placeholder="Total" className={fieldClass(form.Cost, validated)} value={form.Cost} onChange={setField("Cost")} />
          </div>
          <div className="field-group">
            <label htmlFor="Payment" className="field-label">
              <i className="fa-solid fa-wallet"></i> Payment
            </label>
            <select id="Payment" name="Payment" className={fieldClass(form.Payment, validated)} value={form.Payment} onChange={setField("Payment")}>
              <option value="">Paid w/</option>
              <option value="Cash">Cash</option>
              <option value="Zelle">Zelle</option>
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="Deposit" className="field-label">
              <i className="fa-solid fa-hand-holding-dollar"></i> Deposit
            </label>
            <input type="text" name="Deposit" id="Deposit" placeholder="Deposit" className={fieldClass(form.Deposit, validated)} value={form.Deposit} onChange={setField("Deposit")} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="field-group sm:col-span-2">
            <label htmlFor="Items" className="field-label">
              <i className="fa-solid fa-clipboard-list"></i> Items
            </label>
            <textarea
              name="Items"
              id="Items"
              rows="3"
              placeholder="Customer order"
              className={`${fieldClass(form.Items, validated)} resize-none`}
              value={form.Items}
              onChange={setField("Items")}
            ></textarea>
          </div>
          <div className="field-group">
            <label htmlFor="Quantity" className="field-label">
              <i className="fa-solid fa-hashtag"></i> Quantity
            </label>
            <input
              type="number"
              name="Quantity"
              id="Quantity"
              min="1"
              max="10"
              className={fieldClass(form.Quantity, validated)}
              value={form.Quantity}
              onChange={setField("Quantity")}
            />
          </div>
        </div>

        <div className="flex justify-center">
          <button id="addDate" type="submit" className="btn-3d">
            <i className="fa-solid fa-paper-plane"></i> Submit Order
          </button>
        </div>
      </TiltCard>
    </Layout>
  );
}
