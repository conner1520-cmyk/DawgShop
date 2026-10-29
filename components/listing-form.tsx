"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveListing } from "@/app/listings/actions";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { AREAS } from "@/lib/areas";
import {
  CATEGORIES,
  CONDITIONS,
  DESCRIPTION_MAX,
  PHOTOS_MAX,
  PHOTO_BUCKET,
  TITLE_MAX,
  validateFields,
  type ListingErrors,
  type ListingField,
  type ListingInput,
} from "@/lib/listings";
import { createClient } from "@/lib/supabase/client";

// A photo in the form. "saved" photos are already part of the listing (edit
// only); "new" ones were just picked and are uploaded when you tap Post.
type Photo =
  | { key: string; kind: "saved"; path: string; url: string | null }
  | { key: string; kind: "new"; blob: Blob; preview: string; uploading: boolean };

export type ListingFormInitial = {
  title: string;
  price: string;
  category: string;
  condition: string;
  pickup_area: string;
  course: string;
  description: string;
  available_from: string;
  photos: { path: string; url: string | null }[];
};

const MAX_EDGE = 1600; // px on the long edge
const JPEG_QUALITY = 0.82;

// crypto.randomUUID only exists on https (and localhost). Testing on a phone
// over the local network is plain http, so fall back to getRandomValues.
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Shrink a photo to at most 1600px and re-save it as JPEG. Phone photos are
// often 4-12 MB; this makes them a few hundred KB so they upload fast on
// campus Wi-Fi. If the browser can open the file (Safari opens iPhone HEIC
// photos), this also converts it to JPEG. Throws if the browser can't read it.
async function toJpeg(file: File): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // JPEG has no transparency; use white instead of black behind PNGs.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } finally {
    URL.revokeObjectURL(src);
  }
}

const UNREADABLE =
  "We couldn't open that photo. If it's an iPhone HEIC photo, try Safari, or choose a JPG or PNG instead.";

// The sell form (prototype: vSell), used to create a listing on /sell and to
// edit one on /listings/[id]/edit.
export function ListingForm({
  userId,
  listingId,
  initial,
  today,
}: {
  userId: string;
  listingId: string | null; // null = new listing
  initial: ListingFormInitial;
  today: string; // 'YYYY-MM-DD' in Athens, from the server
}) {
  const router = useRouter();
  const editing = listingId !== null;

  const [title, setTitle] = useState(initial.title);
  const [price, setPrice] = useState(initial.price);
  const [category, setCategory] = useState(initial.category);
  const [condition, setCondition] = useState(initial.condition || "Used");
  const [area, setArea] = useState(initial.pickup_area);
  const [course, setCourse] = useState(initial.course);
  const [description, setDescription] = useState(initial.description);
  const [later, setLater] = useState(!!initial.available_from);
  const [from, setFrom] = useState(initial.available_from);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    initial.photos.map((p) => ({ key: p.path, kind: "saved", path: p.path, url: p.url })),
  );
  const [processing, setProcessing] = useState(0); // photos being resized
  const [errors, setErrors] = useState<ListingErrors>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");

  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = phase !== "idle";
  const room = PHOTOS_MAX - photos.length - processing;

  function focusFirstError() {
    setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    }, 0);
  }

  function clearError(field: ListingField) {
    if (errors[field] || errors.form) setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
  }

  async function addFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    clearError("photos");
    const take = files.slice(0, Math.max(0, room));
    if (files.length > take.length) {
      setErrors((e) => ({ ...e, photos: `You can add up to ${PHOTOS_MAX} photos.` }));
    }
    setProcessing((n) => n + take.length);
    for (const file of take) {
      try {
        const blob = await toJpeg(file);
        const photo: Photo = { key: uuid(), kind: "new", blob, preview: URL.createObjectURL(blob), uploading: false };
        setPhotos((ps) => [...ps, photo]);
      } catch {
        setErrors((e) => ({ ...e, photos: UNREADABLE }));
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  function removePhoto(key: string) {
    setPhotos((ps) => {
      const p = ps.find((x) => x.key === key);
      if (p?.kind === "new") URL.revokeObjectURL(p.preview);
      return ps.filter((x) => x.key !== key);
    });
    clearError("photos");
  }

  // Best effort: delete photos we uploaded for a save that then failed.
  async function discard(paths: string[]) {
    const supabase = createClient();
    if (!supabase || !paths.length) return;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) console.warn("couldn't remove unused photos:", error.message);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (processing) {
      setErrors({ photos: "Wait a second for your photos to finish loading." });
      return;
    }

    const input: ListingInput = {
      title,
      price,
      category,
      condition,
      pickup_area: area,
      course,
      description,
      available_later: later,
      available_from: from,
      photos: [],
    };

    // Check the fields here first so nothing is uploaded for a form with mistakes.
    const checked = validateFields(input);
    const next: ListingErrors = checked.ok ? {} : { ...checked.errors };
    if (!photos.length) next.photos = "Add at least one photo.";
    if (Object.keys(next).length) {
      setErrors(next);
      focusFirstError();
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setErrors({ form: "DawgShop isn't connected to its database right now. Try again later." });
      return;
    }

    setErrors({});
    setPhase("uploading");

    // 1. Upload new photos into this student's folder, one at a time.
    const uploaded: string[] = [];
    const paths: string[] = [];
    for (const p of photos) {
      if (p.kind === "saved") {
        paths.push(p.path);
        continue;
      }
      const path = `${userId}/${uuid()}.jpg`;
      setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, uploading: true } : x)));
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, p.blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, uploading: false } : x)));
      if (error) {
        console.error("photo upload failed:", error.message);
        await discard(uploaded);
        setPhase("idle");
        setErrors({ photos: "A photo didn't upload. Check your connection and try again." });
        focusFirstError();
        return;
      }
      uploaded.push(path);
      paths.push(path);
    }

    // 2. Save the listing on the server, which checks everything again.
    setPhase("saving");
    let result: Awaited<ReturnType<typeof saveListing>>;
    try {
      result = await saveListing({ ...input, photos: paths }, listingId);
    } catch (err) {
      console.error("saveListing failed:", err);
      result = { ok: false, errors: { form: "We couldn't reach DawgShop. Check your connection and try again." } };
    }

    if (!result.ok) {
      await discard(uploaded);
      setPhase("idle");
      setErrors(result.errors);
      focusFirstError();
      return;
    }

    // 3. Done. Clear the form (Next.js keeps this page around, and the next
    // visit to Sell should start empty), then show the listing.
    if (!editing) {
      photos.forEach((p) => p.kind === "new" && URL.revokeObjectURL(p.preview));
      setTitle("");
      setPrice("");
      setCategory("");
      setCondition("Used");
      setCourse("");
      setDescription("");
      setLater(false);
      setFrom("");
      setPhotos([]);
    }
    setPhase("idle");
    router.replace(`/listings/${result.id}?notice=${editing ? "saved" : "posted"}`);
  }

  // Helpers for accessible field errors (prototype: inv() and er()).
  const inv = (k: ListingField) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {};
  const er = (k: ListingField) =>
    errors[k] ? (
      <div className="err" id={`err-${k}`}>
        {errors[k]}
      </div>
    ) : null;

  const submitLabel =
    phase === "uploading"
      ? "Uploading photos..."
      : phase === "saving"
        ? editing
          ? "Saving..."
          : "Posting..."
        : editing
          ? "Save changes"
          : "Post listing";

  return (
    <form ref={formRef} className="pad" onSubmit={onSubmit} noValidate aria-busy={busy || undefined}>
      {/* ---- Photos ---- */}
      <input
        ref={fileInput}
        id="photo-input"
        type="file"
        accept="image/*"
        multiple
        className="sr"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = ""; // so picking the same photo again still works
        }}
      />
      {photos.length === 0 && processing === 0 ? (
        <button
          type="button"
          className="photopick"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          {...inv("photos")}
        >
          <span>
            <b style={{ color: "var(--ink)" }}>Add photos</b>
            <br />
            Tap to take or choose up to {PHOTOS_MAX}
          </span>
        </button>
      ) : (
        <div className="photos" role="group" aria-label="Photos">
          {photos.map((p, i) => (
            <div className="photo" key={p.key}>
              {/* Local previews and signed URLs; next/image can't optimize either. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.kind === "new" ? p.preview : (p.url ?? "")} alt={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`} />
              {i === 0 && <span className="cover">Cover</span>}
              {p.kind === "new" && p.uploading && (
                <span className="state" aria-label="Uploading">
                  <span className="spinner" />
                </span>
              )}
              <button
                type="button"
                className="remove"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => removePhoto(p.key)}
                disabled={busy}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
          {Array.from({ length: processing }, (_, i) => (
            <div className="photo" key={`processing-${i}`}>
              <span className="state" aria-label="Preparing photo">
                <span className="spinner" />
              </span>
            </div>
          ))}
          {room > 0 && (
            <button
              type="button"
              className="photo add"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              {...inv("photos")}
            >
              <span>
                <PlusIcon />
                <br />
                Add photo
              </span>
            </button>
          )}
        </div>
      )}
      {er("photos") ?? (
        <div className="meta" style={{ marginTop: 8 }}>
          Up to {PHOTOS_MAX} photos. The first one is the cover.
        </div>
      )}

      {/* ---- Details ---- */}
      <label className="l" htmlFor="f-title">
        Title
      </label>
      <input
        className="in"
        id="f-title"
        maxLength={TITLE_MAX}
        value={title}
        placeholder="Mini fridge, 3.1 cu ft"
        onChange={(e) => {
          setTitle(e.target.value);
          clearError("title");
        }}
        {...inv("title")}
      />
      {er("title")}

      <label className="l" htmlFor="f-price">
        Price
      </label>
      <div className="money">
        <span>$</span>
        <input
          className="in"
          id="f-price"
          inputMode="numeric"
          maxLength={6}
          value={price}
          placeholder="0 for free"
          onChange={(e) => {
            setPrice(e.target.value);
            clearError("price");
          }}
          {...inv("price")}
        />
      </div>
      {er("price")}

      <label className="l" htmlFor="f-cat">
        Category
      </label>
      <select
        className="in"
        id="f-cat"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          clearError("category");
        }}
        {...inv("category")}
      >
        <option value="">Choose a category</option>
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {er("category")}

      {category === "Textbooks" && (
        <>
          <label className="l" htmlFor="f-course">
            Course number
          </label>
          <input
            className="in"
            id="f-course"
            maxLength={20}
            value={course}
            placeholder="ACCT 2101"
            autoCapitalize="characters"
            onChange={(e) => {
              setCourse(e.target.value);
              clearError("course");
            }}
            {...inv("course")}
            aria-describedby={errors.course ? "err-course" : "course-hint"}
          />
          {er("course") ?? (
            <div className="meta" id="course-hint" style={{ marginTop: 4 }}>
              Students search by course, so this helps it sell.
            </div>
          )}
        </>
      )}

      <span className="l" id="cond-label">
        Condition
      </span>
      <div className="seg" role="group" aria-labelledby="cond-label">
        {CONDITIONS.map((c) => (
          <button key={c} type="button" aria-pressed={condition === c} onClick={() => setCondition(c)}>
            {c}
          </button>
        ))}
      </div>
      {er("condition")}

      <label className="l" htmlFor="f-area">
        Pickup spot
      </label>
      <select
        className="in"
        id="f-area"
        value={area}
        onChange={(e) => {
          setArea(e.target.value);
          clearError("pickup_area");
        }}
        {...inv("pickup_area")}
      >
        <option value="">Where can buyers pick it up?</option>
        {AREAS.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
      {er("pickup_area")}

      <label className="l" htmlFor="f-desc">
        Description
      </label>
      <textarea
        className="in"
        id="f-desc"
        maxLength={DESCRIPTION_MAX}
        value={description}
        placeholder="Condition, size, why you're selling"
        onChange={(e) => {
          setDescription(e.target.value);
          clearError("description");
        }}
        {...inv("description")}
      />
      {er("description")}

      <label className="switchrow" htmlFor="f-later">
        <span>
          <b>Available later</b>
          <p>For move-in listings. Buyers can reserve it now.</p>
        </span>
        <input
          type="checkbox"
          id="f-later"
          checked={later}
          onChange={(e) => {
            setLater(e.target.checked);
            clearError("available_from");
          }}
        />
      </label>
      {later && (
        <>
          <label className="l" htmlFor="f-from">
            Available from
          </label>
          <input
            className="in"
            type="date"
            id="f-from"
            min={today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              clearError("available_from");
            }}
            {...inv("available_from")}
          />
          {er("available_from")}
        </>
      )}

      {errors.form && (
        <div className="formerr" role="alert">
          {errors.form}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 24 }} type="submit" disabled={busy}>
        {submitLabel}
      </button>
      <div className="sr" role="status" aria-live="polite">
        {phase === "uploading" ? "Uploading photos" : phase === "saving" ? "Saving your listing" : ""}
      </div>
    </form>
  );
}
