
import React, { useState } from "react";
import { Card } from "../../components/UI";

export default function PropertyImageUploader({
  property,
  onUpdated
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const images = property?.images || [];
  if (!property?.id) {
  return (
    <Card
      title="Property Photo Gallery"
      desc="Select a property before managing its photos."
    >
      <p className="muted">
        Please select a property from My Properties to upload images.
      </p>
    </Card>
  );
}
  async function uploadImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) return;

    if (files.length + images.length > 8) {
      setMessage("Maximum 8 images allowed per property.");
      return;
    }

    setBusy(true);
    setMessage("");

    let uploaded = 0;

    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Please select image files only.");
        }

        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Each image must be under 5 MB.");
        }

        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(
          `/api/properties/${property.id}/images`,
          {
            method: "POST",
            credentials: "include",
            body: formData
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Upload failed");
        }

        uploaded++;
      }

      setMessage(`${uploaded} image(s) uploaded successfully.`);
    } catch (error) {
      setMessage(
        `${uploaded} uploaded. ${error.message}`
      );
    } finally {
      setBusy(false);
      onUpdated?.();
    }
  }

  async function deleteImage(imageId) {
    if (!window.confirm("Remove this photo from the gallery?")) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/properties/${property.id}/images/${imageId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Delete failed");
      }

      setMessage("Photo removed from gallery.");
      onUpdated?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

async function setCoverImage(imageId) {
  setBusy(true);
  setMessage("");

  try {
    const response = await fetch(
      `/api/properties/${property.id}/cover-image`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ imageId })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Unable to update cover image"
      );
    }

    setMessage("Cover photo updated successfully.");
    onUpdated?.();
  } catch (error) {
    setMessage(error.message);
  } finally {
    setBusy(false);
  }
}

  return (
    <Card
      title="Property Photo Gallery"
      desc="Upload up to 8 property photos. Max 5 MB each."
    >
      <div className="gn-upload-panel">
        <label className="gn-upload-button">
          {busy ? "Processing..." : "Upload Property Photos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy || images.length >= 8}
            onChange={uploadImages}
            hidden
          />
        </label>

        <p className="muted">{images.length} / 8 photos</p>
      </div>

      {message && <p role="status">{message}</p>}



<div className="gn-owner-gallery">
  {images.map((image) => (
    <div className="gn-owner-photo" key={image.id}>
      <img
        src={image.imageUrl}
        alt={`${property.title} property`}
        loading="lazy"
      />

      {property.imageUrl === image.imageUrl ? (
        <span className="gn-cover-label">
          ★ Current Cover
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setCoverImage(image.id)}
        >
          Set as Cover
        </button>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => deleteImage(image.id)}
      >
        Remove
      </button>
    </div>
  ))}
</div>


      {images.length === 0 && (
        <p className="muted">
          No photos uploaded yet. Add your first property photo.
        </p>
      )}
    </Card>
  );
}
