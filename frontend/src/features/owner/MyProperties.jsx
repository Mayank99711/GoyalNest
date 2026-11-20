import "./MyProperties.css";
import React, { useState } from "react";
import {
  Card,
  Form,
  DataList,
  Action,
  Pill,
  useRemote
} from "../../components/UI";

import { api } from "../../lib/api";
import PropertyImageUploader from "./PropertyImageUploader";
import "../marketplace/PublicHome.css";
import "./ProfessionalWorkbench.css";

const propertyTypes = [
  "PG",
  "HOSTEL",
  "APARTMENT",
  "FLAT",
  "COMMERCIAL",
  "SHARED"
];

export default function MyProperties() {
  const [selectedId, setSelectedId] = useState(null);
  const [propertyModal,setPropertyModal] = useState(false);
  const [createdProperty,setCreatedProperty] = useState(null);
  const [queuedPhotos,setQueuedPhotos] = useState([]);
  const [photoProgress,setPhotoProgress] = useState("");
  const [newCategoryName,setNewCategoryName] = useState("");
  const [categoryNote,setCategoryNote] = useState("");
  const [categories,setCategories] = React.useState([]);
  React.useEffect(()=>{api("/categories").then(setCategories).catch(()=>{});},[]);
  const blankProperty = {title:"",type:"PG",city:"",locality:"",address:"",description:"",amenities:"",categoryId:""};
const [editingUnit, setEditingUnit] = useState(null);
const [editingPropertyId, setEditingPropertyId] = useState(null);

const [propertyForm, setPropertyForm] = useState({
  title: "",
  type: "PG",
  city: "",
  locality: "",
  address: "",
  description: "",
  amenities: "",
  categoryId: ""
});

const [propertySaving, setPropertySaving] = useState(false);
const [propertyEditError, setPropertyEditError] = useState("");
const [propertyEditSuccess, setPropertyEditSuccess] = useState("");

const startPropertyEdit = (property) => {
  setPropertyEditError("");
  setPropertyEditSuccess("");

  setCreatedProperty(null);setQueuedPhotos([]);setPhotoProgress("");
  setEditingPropertyId(property.id);
  setPropertyModal(true);

  setPropertyForm({
    title: property.title || "",
    type: property.type || "PG",
    city: property.city || "",
    locality: property.locality || "",
    address: property.address || "",
    description: property.description || "",
    amenities: property.amenities || "",
    categoryId: property.categoryId || ""
  });
};

const startPropertyCreate = () => {
 setEditingPropertyId(null);setCreatedProperty(null);setQueuedPhotos([]);setPhotoProgress("");setPropertyForm({...blankProperty});setPropertyEditError("");setPropertyModal(true);
};
const createProperty = async(event) => {
 event.preventDefault();if(propertySaving) return;
 setPropertySaving(true);setPropertyEditError("");
 try {
   const result=await api("/properties",{method:"POST",body:{...propertyForm,categoryId:propertyForm.categoryId||null}});
   setCreatedProperty(result);setSelectedId(result.id);
   let completed=0;
   for(const file of queuedPhotos){
      try{
        const form=new FormData();form.append("image",file);
        const response=await fetch(`/api/properties/${result.id}/images`,{method:"POST",credentials:"include",body:form});
        if(!response.ok){const body=await response.json();throw new Error(body.error||"Photo upload failed")}
        completed++;
      }catch(error){setPhotoProgress(`${completed} photos uploaded. ${error.message}. You can retry in Manage Property.`);break}
   }
   if(completed===queuedPhotos.length)setPhotoProgress(`${completed} photos uploaded successfully.`);
   setQueuedPhotos([]);
   setPropertyEditSuccess("Property draft created. Add rooms and submit for approval.");reload();
 } catch(err){setPropertyEditError(err.message);} finally{setPropertySaving(false);}
};
const requestCategory = async(event)=>{
 event.preventDefault();setCategoryNote("");
 try{await api("/categories/requests",{method:"POST",body:{name:newCategoryName}});
 setCategoryNote("Category request submitted to Super Admin.");setNewCategoryName("");}
 catch(err){setCategoryNote(err.message);}
};
const changeAvailability = async(property)=>{
 if(!window.confirm(`Make ${property.title} ${property.active===false?"active":"inactive"}?`)) return;
 try{await api(`/properties/${property.id}/availability`,{method:"PATCH",body:{active:property.active===false}});reload();}
 catch(err){setPropertyEditSuccess(err.message);}
};
const changePropertyField = (name, value) => {
  setPropertyForm((previous) => ({
    ...previous,
    [name]: value
  }));
};

const savePropertyChanges = async (event) => {
  event.preventDefault();

  if (!editingPropertyId || propertySaving) return;

  const originalProperty = properties.find(
    (property) => property.id === editingPropertyId
  );

  if (originalProperty?.status === "PUBLISHED") {
    const confirmed = window.confirm(
      "Saving these changes will send this published property for Admin review. " +
      "It will temporarily disappear from public listings until approved. Continue?"
    );

    if (!confirmed) return;
  }

  setPropertySaving(true);
  setPropertyEditError("");
  setPropertyEditSuccess("");

  try {
    const response = await fetch(
      `/api/properties/${editingPropertyId}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({...propertyForm,categoryId:propertyForm.categoryId||null})
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Unable to update property"
      );
    }

    setEditingPropertyId(null);
    setPropertyModal(false);
    setPropertyEditSuccess("Property details updated successfully.");
    reload();
  } catch (error) {
    setPropertyEditError(error.message);
  } finally {
    setPropertySaving(false);
  }
};
const [unitBusy, setUnitBusy] = useState(false);
const [unitError, setUnitError] = useState("");
const [unitSuccess, setUnitSuccess] = useState("");

const [unitForm, setUnitForm] = useState({
  label: "",
  bhk: "",
  capacity: "1",
  rent: "",
  depositAmount: "0",
  active: true
});

const changeUnitField = (name, value) => {
  setUnitForm((previous) => ({
    ...previous,
    [name]: value
  }));
};

const openUnitEditor = async (unitId) => {
  setUnitError("");
  setUnitSuccess("");
  setUnitBusy(true);

  try {
    const response = await fetch("/api/owner-workspace/units", {
      credentials: "include"
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to load unit details");
    }

    const unit = result.units?.find((item) => item.id === unitId);

    if (!unit) {
      throw new Error("Unit not found");
    }

    setEditingUnit(unit.id);
    setUnitForm({
      label: unit.label || "",
      bhk: unit.bhk == null ? "" : String(unit.bhk),
      capacity: String(unit.capacity),
      rent: String(unit.rent),
      depositAmount: String(unit.depositAmount ?? 0),
      active: unit.active
    });
  } catch (error) {
    setUnitError(error.message);
  } finally {
    setUnitBusy(false);
  }
};

const saveUnitChanges = async (event) => {
  event.preventDefault();

  if (!editingUnit || unitBusy) return;

  setUnitBusy(true);
  setUnitError("");
  setUnitSuccess("");

  const payload = {
    label: unitForm.label.trim(),
    bhk: unitForm.bhk === "" ? null : Number(unitForm.bhk),
    capacity: Number(unitForm.capacity),
    rent: Number(unitForm.rent),
    depositAmount: Number(unitForm.depositAmount),
    active: unitForm.active
  };

  if (
    !payload.label ||
    !Number.isInteger(payload.capacity) ||
    payload.capacity < 1 ||
    !Number.isInteger(payload.rent) ||
    payload.rent < 1 ||
    !Number.isInteger(payload.depositAmount) ||
    payload.depositAmount < 0 ||
    (payload.bhk !== null &&
      (!Number.isInteger(payload.bhk) || payload.bhk < 0))
  ) {
    setUnitError("Please enter valid unit details.");
    setUnitBusy(false);
    return;
  }

  try {
    const response = await fetch(
      `/api/owner-workspace/units/${editingUnit}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to update unit");
    }

    setEditingUnit(null);
    setUnitSuccess("Room / Unit updated successfully.");
    reload();
  } catch (error) {
    setUnitError(error.message);
  } finally {
    setUnitBusy(false);
  }
};
  const {
    data,
    error,
    busy,
    reload
  } = useRemote("/properties/mine");

  const properties = Array.isArray(data) ? data : [];

  // Always use latest API data after reload.
  const selected = properties.find(
    property => property.id === selectedId
  );

  const draftCount = properties.filter(
    p => p.status === "DRAFT"
  ).length;

  const pendingCount = properties.filter(
    p => p.status === "PENDING"
  ).length;

  const publishedCount = properties.filter(
    p => p.status === "PUBLISHED"
  ).length;

  return (
    <div className="dashboard-grid">

      <div className="stats">
        <div>
          <span>Total Properties</span>
          <strong>{properties.length}</strong>
        </div>

        <div>
          <span>Draft</span>
          <strong>{draftCount}</strong>
        </div>

        <div>
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </div>

        <div>
          <span>Published</span>
          <strong>{publishedCount}</strong>
        </div>
      </div>

      <Card title="Property Management" desc="Add a new property or manage existing listings from the table below.">
        <button type="button" className="btn primary" onClick={startPropertyCreate}>+ Add New Property</button>
        <div className="gn-category-request">
          <h3>Need a new property category?</h3>
          <form onSubmit={requestCategory} className="gn-category-request-form">
            <input aria-label="Proposed category name" minLength={2} maxLength={70} required placeholder="Requested category name" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)}/>
            <button className="btn outline" type="submit">Request Category</button>
          </form>
          {categoryNote && <p role="status">{categoryNote}</p>}
        </div>
      </Card>

      <Card
        title="My Property Listings"
        desc="Select a property to manage its rooms, images and approval."
      >
        {busy && <p>Loading properties...</p>}

        {error && <p className="error">{error}</p>}

        {!busy && !error && (
          <div className="gn-property-directory"><DataList
            items={properties}
            empty="No properties found."
            render={property => (
              <div className="gn-property-list-row">
                <div className="gn-property-details">
                  <h3>{property.title}</h3>

                  <p className="muted">
                    {property.city} · {property.type}
                  </p>

                  <p>
                    {property.units?.length || 0} rentable units
                  </p>

                  <Pill>{property.status}</Pill>
                </div>

                <div className="gn-property-buttons"><button
                  type="button"
                  className="btn outline"
                  onClick={() => {setSelectedId(property.id);setEditingUnit(null)}}
                >
                  Manage Property
                </button>
                <button
  type="button"
  className="btn outline"
  disabled={property.status === "PENDING"}
  onClick={() => startPropertyEdit(property)}
>
  Edit Property
</button>
                <button type="button" className="btn outline" onClick={()=>changeAvailability(property)} aria-label={`Toggle availability for ${property.title}`}>
                  {property.active===false ? "Inactive · Activate" : "Active · Deactivate"}
                </button></div>
              </div>
            )}
          /></div>
        )}
      </Card>
      {propertyEditSuccess && (
  <p role="status" style={{ color: "#176447" }}>
    {propertyEditSuccess}
  </p>
)}

{propertyModal && (
  <div className="gn-property-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!propertySaving)setPropertyModal(false)}}>
  <section role="dialog" aria-modal="true" aria-label={editingPropertyId ? "Edit Property" : "Add Property"} className="gn-property-modal">
    <header className="gn-property-modal-header"><h2>{editingPropertyId ? "Edit Property" : "Add New Property"}</h2><button type="button" className="btn outline" onClick={()=>setPropertyModal(false)}>Close ×</button></header>
    <p className="muted">{editingPropertyId ? "Update property details without deleting bookings or rooms." : createdProperty ? "Step 2: Upload photos. You can manage rooms after closing this popup." : "Step 1: Enter details; after saving, photos can be uploaded in this popup."}</p>
    {photoProgress&&<p role="status">{photoProgress}</p>}
    {createdProperty ? <div><PropertyImageUploader property={selected||createdProperty} onUpdated={reload}/><button className="btn primary" type="button" onClick={()=>{setPropertyModal(false);setCreatedProperty(null);setSelectedId(createdProperty.id)}}>Done - Manage Rooms</button></div> : <>
    <form
      className="owner-property-edit-form"
      onSubmit={editingPropertyId ? savePropertyChanges : createProperty}
    >
      <div className="owner-property-edit-grid">
        <label>
          Property Name
          <input
            required
            minLength={2}
            maxLength={150}
            value={propertyForm.title}
            onChange={(event) =>
              changePropertyField("title", event.target.value)
            }
          />
        </label>

        <label>
          Property Category
          <select required value={propertyForm.categoryId||""} onChange={event=>{
             const chosen=categories.find(c=>c.id===event.target.value);
             const knownType=propertyTypes.find(t=>t===chosen?.name?.toUpperCase().replaceAll(" ","_"));
             setPropertyForm(previous=>({...previous,categoryId:event.target.value,type:knownType||previous.type||"PG"}));
           }}>
            <option value="">Select property category</option>
            {categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>
          City
          <input
            required
            value={propertyForm.city}
            onChange={(event) =>
              changePropertyField("city", event.target.value)
            }
          />
        </label>

        <label>
          Locality
          <input
            value={propertyForm.locality}
            onChange={(event) =>
              changePropertyField("locality", event.target.value)
            }
          />
        </label>

        <label className="owner-property-full">
          Full Address
          <input
            required
            minLength={5}
            value={propertyForm.address}
            onChange={(event) =>
              changePropertyField("address", event.target.value)
            }
          />
        </label>

        <label className="owner-property-full">
          Description
          <textarea
            rows={3}
            value={propertyForm.description}
            onChange={(event) =>
              changePropertyField("description", event.target.value)
            }
          />
        </label>

        <label className="owner-property-full">
          Amenities
          <textarea
            rows={2}
            value={propertyForm.amenities}
            onChange={(event) =>
              changePropertyField("amenities", event.target.value)
            }
          />
        </label>
      </div>

      {!editingPropertyId&&<div className="gn-photo-queue"><label>Property photos (optional, up to 8 files, maximum 5 MB each)<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length>8||files.some(f=>f.size>5*1024*1024)){setPropertyEditError("Choose up to 8 photos, each under 5 MB.");return}setPropertyEditError("");setQueuedPhotos(files)}}/></label>{queuedPhotos.length>0&&<div className="gn-preview-photos">{queuedPhotos.map((f,i)=><div key={`${f.name}-${i}`}><span>{f.name}</span><small>{(f.size/1024/1024).toFixed(1)} MB</small></div>)}</div>}</div>}
      <p className="muted">Published property edits require Admin reapproval. New properties save as drafts; selected photos upload immediately after the draft is created.</p>

      {propertyEditError && (
        <p className="error" role="alert">
          {propertyEditError}
        </p>
      )}

      <div className="owner-property-edit-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={propertySaving}
        >
          {propertySaving ? "Saving..." : editingPropertyId ? "Save Changes" : "Create Property"}
        </button>

        <button
          type="button"
          className="btn outline"
          disabled={propertySaving}
          onClick={() => {
            setEditingPropertyId(null);
            setPropertyModal(false);
            setPropertyEditError("");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
    </>}
  </section>
  </div>
)}

      {selected && (
        <div className="gn-property-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setSelectedId(null)}>
          <section className="gn-property-modal gn-manage-property-modal" role="dialog" aria-modal="true" aria-label={`Manage ${selected.title}`}>
          <header className="gn-property-modal-header"><div><h2>Manage: {selected.title}</h2><p className="muted">Units, photos and listing approval</p></div><button className="btn outline" onClick={()=>setSelectedId(null)}>Close ×</button></header>
        <div className="dashboard-grid">

          <Card
            title={`Manage: ${selected.title}`}
            desc="Manage units and submit your listing for approval."
          >
            <h3>Existing Units</h3>

            <DataList
  items={selected.units || []}
  empty="No rooms or rentable units added."
  render={(unit) => (
    <div className="owner-unit-card">
      <div className="owner-unit-info">
        <strong>Room {unit.label}</strong>

        <p className="muted">
          {unit.bhk != null ? `${unit.bhk} BHK · ` : ""}
          Capacity: {unit.capacity}
        </p>

        <p>
          <strong>
            ₹{Number(unit.rent).toLocaleString("en-IN")}
          </strong>
          /month
        </p>

        <p className="muted">
          Security Deposit: ₹
          {Number(unit.depositAmount || 0).toLocaleString("en-IN")}
        </p>
      </div>

      <button
        type="button"
        className="btn outline"
        disabled={unitBusy}
        onClick={() => openUnitEditor(unit.id)}
      >
        Edit Unit
      </button>
    </div>
  )}
/>

{unitError && (
  <p className="error" role="alert">
    {unitError}
  </p>
)}

{unitSuccess && (
  <p role="status" style={{ color: "#176447" }}>
    {unitSuccess}
  </p>
)}

{editingUnit && (
  <div className="owner-unit-editor">
    <h3>Edit Room / Unit</h3>

    <form onSubmit={saveUnitChanges}>
      <div className="owner-unit-edit-grid">

        <label>
          Room / Flat Number
          <input
            required
            maxLength={80}
            value={unitForm.label}
            onChange={(e) =>
              changeUnitField("label", e.target.value)
            }
          />
        </label>

        <label>
          BHK
          <input
            type="number"
            min="0"
            max="20"
            value={unitForm.bhk}
            onChange={(e) =>
              changeUnitField("bhk", e.target.value)
            }
          />
        </label>

        <label>
          Capacity
          <input
            type="number"
            required
            min="1"
            max="100"
            value={unitForm.capacity}
            onChange={(e) =>
              changeUnitField("capacity", e.target.value)
            }
          />
        </label>

        <label>
          Monthly Rent (₹)
          <input
            type="number"
            required
            min="1"
            max="100000000"
            value={unitForm.rent}
            onChange={(e) =>
              changeUnitField("rent", e.target.value)
            }
          />
        </label>

        <label>
          Security Deposit (₹)
          <input
            type="number"
            required
            min="0"
            max="100000000"
            value={unitForm.depositAmount}
            onChange={(e) =>
              changeUnitField("depositAmount", e.target.value)
            }
          />
        </label>

        <label className="owner-unit-active">
          <input
            type="checkbox"
            checked={unitForm.active}
            onChange={(e) =>
              changeUnitField("active", e.target.checked)
            }
          />
          Active / Available for rental
        </label>

      </div>

      <div className="owner-unit-edit-actions">
        <button
          type="submit"
          className="btn primary"
          disabled={unitBusy}
        >
          {unitBusy ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          className="btn outline"
          disabled={unitBusy}
          onClick={() => {
            setEditingUnit(null);
            setUnitError("");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
)}

            <h3>Add New Unit</h3>

            <Form
              endpoint={`/properties/${selected.id}/units`}
              after={reload}
              submit="Add Room / Unit"
              fields={[
                {
                  name: "label",
                  label: "Room / Flat Number",
                  required: true
                },
                {
                  name: "bhk",
                  label: "BHK",
                  type: "number"
                },
                {
                  name: "capacity",
                  label: "Capacity",
                  type: "number",
                  required: true,
                  min: 1
                },
                {
                  name: "rent",
                  label: "Monthly Rent (INR)",
                  type: "number",
                  required: true,
                  min: 1
                },
                {
                  name: "depositAmount",
                  label: "Optional Security Deposit",
                  type: "number",
                  min: 0
                }
              ]}
            />

            {selected.status === "DRAFT" && (
              <div style={{ marginTop: 20 }}>
                <Action
                  path={`/properties/${selected.id}/submit`}
                  onDone={reload}
                  variant="primary"
                >
                  Submit for Admin Approval
                </Action>
              </div>
            )}

            <button
              type="button"
              className="btn outline"
              onClick={() => setSelectedId(null)}
              style={{ marginTop: 20 }}
            >
              Close Property
            </button>
          </Card>

          <PropertyImageUploader
            property={selected}
            onUpdated={reload}
          />

        </div></section></div>
      )}

    </div>
  );
}
