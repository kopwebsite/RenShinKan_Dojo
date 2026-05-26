import {
  AlertCircle,
  CheckCircle,
  ImagePlus,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Video,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { MediaSlider } from "../components/MediaSlider";
import {
  dojoUpdates,
  examAnnouncement,
  historyMedia,
  onTheMatMedia,
  passedTestStudents,
  sendNewsletterUpdatePlaceholder,
  type DojoUpdate,
  type EditableMedia,
  type PassedTestStudent,
} from "../data/editableContent";
import { isValidEmbedUrl, normalizeEmbedUrl } from "../utils/mediaEmbeds";

const ADMIN_PASSWORD_HASH =
  "ccef3a07dc13054d4d8d6b3ef8aeeaa4651ddcb69fa8d172e06bf6d3212975ac";

const SUBJECT_LIMIT = 90;
const BODY_LIMIT = 1800;
const SUMMARY_LIMIT = 180;
const MAX_UPDATE_PHOTOS = 6;

type AdminDraft = {
  updates: DojoUpdate[];
  historyMedia: EditableMedia[];
  onTheMatMedia: EditableMedia[];
  examAnnouncement: typeof examAnnouncement;
  passedTestStudents: PassedTestStudent[];
};

type UpdateForm = {
  subject: string;
  body: string;
  summary: string;
  videoUrl: string;
};

const emptyUpdateForm: UpdateForm = {
  subject: "",
  body: "",
  summary: "",
  videoUrl: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeLocalImageMedia(file: File, prefix: string): EditableMedia {
  const src = URL.createObjectURL(file);

  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    type: "image",
    src,
    alt: file.name.replace(/\.[^.]+$/, ""),
    title: file.name.replace(/\.[^.]+$/, ""),
    caption: "",
    dateAdded: new Date().toISOString(),
    objectPosition: "center",
  };
}

function sectionTitle(title: string, copy: string) {
  return (
    <div className="mb-5">
      <h2 className="text-3xl leading-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal/72">{copy}</p>
    </div>
  );
}

function Counter({ value, limit }: { value: string; limit: number }) {
  return (
    <span className={value.length > limit ? "font-bold text-vermilion" : "text-charcoal/55"}>
      {value.length}/{limit}
    </span>
  );
}

export function AdminPage() {
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem("renshinkan-admin") === "true");
  const [draft, setDraft] = useState<AdminDraft>({
    updates: dojoUpdates,
    historyMedia,
    onTheMatMedia,
    examAnnouncement,
    passedTestStudents,
  });
  const [updateForm, setUpdateForm] = useState<UpdateForm>(emptyUpdateForm);
  const [updatePhotos, setUpdatePhotos] = useState<EditableMedia[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyVideo, setHistoryVideo] = useState("");
  const [matVideo, setMatVideo] = useState("");
  const [studentForm, setStudentForm] = useState({ name: "", caption: "", date: "" });
  const [publishStatus, setPublishStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [publishMessage, setPublishMessage] = useState("");

  const previewUpdate = useMemo<DojoUpdate | null>(() => {
    if (!updateForm.subject.trim()) {
      return null;
    }

    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const media = updatePhotos;
    const slug = slugify(updateForm.subject);

    return {
      id: editingId || `${slug}-${Date.now()}`,
      date,
      subject: updateForm.subject.trim(),
      summary: updateForm.summary.trim(),
      body: updateForm.body.trim(),
      media,
      mainImage: media.find((item) => item.type === "image")?.src || "",
      slug,
    };
  }, [editingId, updateForm.body, updateForm.subject, updateForm.summary, updatePhotos]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const hash = await sha256(password);

    if (hash === ADMIN_PASSWORD_HASH) {
      sessionStorage.setItem("renshinkan-admin", "true");
      setIsAuthed(true);
      setPassword("");
      setAuthError("");
      return;
    }

    setAuthError("That password did not match.");
  };

  const addUpdatePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const available = MAX_UPDATE_PHOTOS - updatePhotos.filter((item) => item.type === "image").length;
    const nextPhotos = files.slice(0, available).map((file) => makeLocalImageMedia(file, "update-photo"));
    setUpdatePhotos((current) => [...current, ...nextPhotos]);
    event.target.value = "";
  };

  const addUpdateVideo = () => {
    if (!isValidEmbedUrl(updateForm.videoUrl)) {
      setPublishStatus("error");
      setPublishMessage("Video links must be YouTube, Vimeo, or another HTTPS embed/player URL.");
      return;
    }

    setUpdatePhotos((current) => [
      ...current,
      {
        id: `update-video-${crypto.randomUUID()}`,
        type: "video",
        src: normalizeEmbedUrl(updateForm.videoUrl),
        title: "Embedded video",
        caption: "",
        dateAdded: new Date().toISOString(),
      },
    ]);
    setUpdateForm((current) => ({ ...current, videoUrl: "" }));
    setPublishStatus("idle");
    setPublishMessage("");
  };

  const saveUpdateToDraft = () => {
    if (!previewUpdate || !previewUpdate.summary || !previewUpdate.body) {
      setPublishStatus("error");
      setPublishMessage("Add a subject, summary, and article body before saving an update.");
      return;
    }

    if (previewUpdate.subject.length > SUBJECT_LIMIT || previewUpdate.summary.length > SUMMARY_LIMIT || previewUpdate.body.length > BODY_LIMIT) {
      setPublishStatus("error");
      setPublishMessage("One of the text fields is over its character limit.");
      return;
    }

    setDraft((current) => ({
      ...current,
      updates: editingId
        ? current.updates.map((update) => (update.id === editingId ? previewUpdate : update))
        : [previewUpdate, ...current.updates],
    }));
    setUpdateForm(emptyUpdateForm);
    setUpdatePhotos([]);
    setEditingId(null);
    setPublishStatus("success");
    setPublishMessage("Update saved to this admin draft. Click Save / Publish Changes to send it to the backend.");
  };

  const editUpdate = (update: DojoUpdate) => {
    setEditingId(update.id);
    setUpdateForm({
      subject: update.subject,
      body: update.body,
      summary: update.summary,
      videoUrl: "",
    });
    setUpdatePhotos(update.media);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDeleteUpdate = () => {
    if (!deleteId) {
      return;
    }

    setDraft((current) => ({
      ...current,
      updates: current.updates.filter((update) => update.id !== deleteId),
    }));
    setDeleteId(null);
    setPublishStatus("success");
    setPublishMessage("Update removed from this admin draft.");
  };

  const addMediaFiles = (
    event: ChangeEvent<HTMLInputElement>,
    key: "historyMedia" | "onTheMatMedia",
    prefix: string,
  ) => {
    const files = Array.from(event.target.files || []);
    const media = files.map((file) => makeLocalImageMedia(file, prefix));
    setDraft((current) => ({ ...current, [key]: [...current[key], ...media] }));
    event.target.value = "";
  };

  const addVideoToSection = (key: "historyMedia" | "onTheMatMedia", url: string, reset: () => void) => {
    if (!isValidEmbedUrl(url)) {
      setPublishStatus("error");
      setPublishMessage("Video links must be HTTPS embed/player URLs.");
      return;
    }

    setDraft((current) => ({
      ...current,
      [key]: [
        ...current[key],
        {
          id: `${key}-video-${crypto.randomUUID()}`,
          type: "video",
          src: normalizeEmbedUrl(url),
          title: "Embedded video",
          caption: "",
          dateAdded: new Date().toISOString(),
        },
      ],
    }));
    reset();
  };

  const addStudentPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setDraft((current) => ({
      ...current,
      passedTestStudents: [
        {
          id: `student-${crypto.randomUUID()}`,
          image: URL.createObjectURL(file),
          name: studentForm.name,
          caption: studentForm.caption,
          date: studentForm.date,
          dateAdded: new Date().toISOString(),
          objectPosition: "center",
        },
        ...current.passedTestStudents,
      ],
    }));
    setStudentForm({ name: "", caption: "", date: "" });
    event.target.value = "";
  };

  const publish = async () => {
    setPublishStatus("saving");
    setPublishMessage("Sending draft to the publish endpoint...");

    const newUpdates = draft.updates.filter((update) => !dojoUpdates.some((existing) => existing.id === update.id));
    const newsletterPayloads = newUpdates.map(sendNewsletterUpdatePlaceholder);

    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, newsletterPayloads }),
      });

      if (!response.ok) {
        throw new Error("Publish endpoint is not configured yet.");
      }

      setPublishStatus("success");
      setPublishMessage("Publish request accepted. GitHub should rebuild after the backend creates the commit.");
    } catch (error) {
      setPublishStatus("error");
      setPublishMessage(
        "This static site cannot publish directly from the browser. Configure the backend/serverless placeholder with GitHub environment variables, then this button can create the commit.",
      );
    }
  };

  if (!isAuthed) {
    return (
      <section className="container-shell py-20">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-paper/80 p-8 shadow-line ring-1 ring-ink/10 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper">
            <Lock size={24} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">Admin</p>
          <h1 className="mt-3 text-4xl leading-tight text-ink">RenshinKan editing mode</h1>
          <p className="mt-4 text-sm leading-6 text-charcoal/72">
            Temporary static password check. Because this site currently ships as static files, true password protection requires a backend or hosting-level authentication. The password is not stored as plain text in this client, but a client-side hash is not production security.
          </p>
          <form onSubmit={login} className="mt-7">
            <label className="text-sm font-bold text-ink" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              className="input-field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {authError ? <p className="mt-3 text-sm font-bold text-vermilion">{authError}</p> : null}
            <button type="submit" className="btn-primary mt-5 w-full">
              Enter editing mode
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="section-title">Dojo content editor</h1>
          <p className="section-copy">
            Manage newsletter updates, galleries, exam announcements, and grading photos from one place.
          </p>
        </div>
        <button type="button" onClick={publish} className="btn-primary">
          <Save size={18} aria-hidden="true" />
          Save / Publish Changes
        </button>
      </div>

      <div className="mb-8 rounded-[1.5rem] bg-vermilion/10 p-5 ring-1 ring-vermilion/20">
        <div className="flex gap-3">
          <AlertCircle className="mt-1 shrink-0 text-vermilion" size={20} aria-hidden="true" />
          <p className="text-sm leading-6 text-charcoal/78">
            This editor can prepare and preview changes in the browser. Publishing to GitHub requires the backend placeholder documented in the repo because GitHub tokens must never be exposed in frontend code.
          </p>
        </div>
      </div>

      {publishMessage ? (
        <div
          className={`mb-8 rounded-[1.5rem] p-5 ring-1 ${
            publishStatus === "error"
              ? "bg-vermilion/10 text-vermilion ring-vermilion/20"
              : "bg-bamboo/10 text-bamboo ring-bamboo/20"
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-bold">
            {publishStatus === "saving" ? <RefreshCw size={18} aria-hidden="true" /> : <CheckCircle size={18} aria-hidden="true" />}
            {publishMessage}
          </div>
        </div>
      ) : null}

      <div className="grid gap-8">
        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("1. Newsletter / Dojo Updates", "Create a new dojo update for students and subscribers. The first photo becomes the main slider image and front-page image.")}
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="block text-sm font-bold text-ink">
              Subject <Counter value={updateForm.subject} limit={SUBJECT_LIMIT} />
              <input
                className="input-field"
                maxLength={SUBJECT_LIMIT + 20}
                value={updateForm.subject}
                onChange={(event) => setUpdateForm((current) => ({ ...current, subject: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-bold text-ink">
              Brief Summary <Counter value={updateForm.summary} limit={SUMMARY_LIMIT} />
              <textarea
                className="input-field min-h-28"
                maxLength={SUMMARY_LIMIT + 40}
                value={updateForm.summary}
                onChange={(event) => setUpdateForm((current) => ({ ...current, summary: event.target.value }))}
              />
            </label>
          </div>
          <label className="mt-5 block text-sm font-bold text-ink">
            Text / Article Body <Counter value={updateForm.body} limit={BODY_LIMIT} />
            <textarea
              className="input-field min-h-52"
              maxLength={BODY_LIMIT + 200}
              value={updateForm.body}
              onChange={(event) => setUpdateForm((current) => ({ ...current, body: event.target.value }))}
            />
          </label>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[1.5rem] bg-paper/60 p-5 ring-1 ring-ink/10">
              <p className="font-bold text-ink">Any photos?</p>
              <p className="mt-2 text-sm leading-6 text-charcoal/70">
                Add up to 6 photos. The first photo you add will appear at the top of the slider and will be used as the main image for this update. Wide 16:9 or 4:3 images work best.
              </p>
              <label className="btn-secondary mt-4 cursor-pointer">
                <ImagePlus size={17} aria-hidden="true" />
                Add photos
                <input className="hidden" type="file" accept="image/*" multiple onChange={addUpdatePhotos} />
              </label>
            </div>
            <div className="rounded-[1.5rem] bg-paper/60 p-5 ring-1 ring-ink/10">
              <p className="font-bold text-ink">Any videos?</p>
              <p className="mt-2 text-sm leading-6 text-charcoal/70">
                Videos must be embed links from YouTube or another external video source. Direct video file uploads will not work.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  className="input-field mt-0"
                  value={updateForm.videoUrl}
                  placeholder="https://www.youtube.com/embed/..."
                  onChange={(event) => setUpdateForm((current) => ({ ...current, videoUrl: event.target.value }))}
                />
                <button type="button" className="btn-secondary shrink-0" onClick={addUpdateVideo}>
                  <Video size={17} aria-hidden="true" />
                  Add
                </button>
              </div>
            </div>
          </div>

          {updatePhotos.length > 0 ? <MediaSlider media={updatePhotos} label="Update media preview" className="mt-6" /> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={saveUpdateToDraft}>
              <Plus size={17} aria-hidden="true" />
              {editingId ? "Update Draft" : "Add Update"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setUpdateForm(emptyUpdateForm);
                setUpdatePhotos([]);
                setEditingId(null);
              }}
            >
              Cancel / Reset
            </button>
          </div>
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("2. A Look at Our History", "Use this section for historical dojo photos, founder/instructor history, old events, demonstrations, seminars, and archival media. Videos must be embed links from YouTube or another external source.")}
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="btn-secondary cursor-pointer">
              <ImagePlus size={17} aria-hidden="true" />
              Add historical photos
              <input className="hidden" type="file" accept="image/*" multiple onChange={(event) => addMediaFiles(event, "historyMedia", "history")} />
            </label>
            <input className="input-field mt-0" value={historyVideo} placeholder="Video embed URL" onChange={(event) => setHistoryVideo(event.target.value)} />
            <button type="button" className="btn-secondary" onClick={() => addVideoToSection("historyMedia", historyVideo, () => setHistoryVideo(""))}>
              <Video size={17} aria-hidden="true" />
              Add video
            </button>
          </div>
          <MediaSlider media={draft.historyMedia} label="History media draft" className="mt-6" />
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("3. On the Mat Gallery", "Use this section for current training photos, class moments, techniques, seminars, and mat practice. Videos must be embed links from YouTube or another external source.")}
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="btn-secondary cursor-pointer">
              <ImagePlus size={17} aria-hidden="true" />
              Add mat photos
              <input className="hidden" type="file" accept="image/*" multiple onChange={(event) => addMediaFiles(event, "onTheMatMedia", "mat")} />
            </label>
            <input className="input-field mt-0" value={matVideo} placeholder="Video embed URL" onChange={(event) => setMatVideo(event.target.value)} />
            <button type="button" className="btn-secondary" onClick={() => addVideoToSection("onTheMatMedia", matVideo, () => setMatVideo(""))}>
              <Video size={17} aria-hidden="true" />
              Add video
            </button>
          </div>
          <MediaSlider media={draft.onTheMatMedia} label="On the Mat media draft" className="mt-6" />
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("4. Examination Date", "Update the public exam announcement text.")}
          <input
            className="input-field"
            value={draft.examAnnouncement.text}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                examAnnouncement: { text: event.target.value, updatedAt: new Date().toISOString() },
              }))
            }
          />
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("5. Students Who Passed the Test", "Use this section for students who passed grading/examination tests. Add photos with optional name, caption, and date fields.")}
          <div className="grid gap-4 md:grid-cols-3">
            <input className="input-field mt-0" value={studentForm.name} placeholder="Name or group title" onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} />
            <input className="input-field mt-0" value={studentForm.caption} placeholder="Caption" onChange={(event) => setStudentForm((current) => ({ ...current, caption: event.target.value }))} />
            <input className="input-field mt-0" value={studentForm.date} placeholder="Date" onChange={(event) => setStudentForm((current) => ({ ...current, date: event.target.value }))} />
          </div>
          <label className="btn-secondary mt-4 cursor-pointer">
            <ImagePlus size={17} aria-hidden="true" />
            Add student photo
            <input className="hidden" type="file" accept="image/*" onChange={addStudentPhoto} />
          </label>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {draft.passedTestStudents.map((student) => (
              <figure key={student.id} className="overflow-hidden rounded-[1.5rem] bg-paper/60 ring-1 ring-ink/10">
                <img src={student.image} alt={student.caption || student.name || ""} className="aspect-[4/3] w-full object-cover" style={{ objectPosition: student.objectPosition || "center" }} />
                <figcaption className="p-4">
                  {student.name ? <p className="font-bold text-ink">{student.name}</p> : null}
                  {student.caption ? <p className="mt-1 text-sm text-charcoal/70">{student.caption}</p> : null}
                  {student.date ? <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-bamboo">{student.date}</p> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("6. Existing Updates: Edit / Delete", "Edit previous dojo updates, delete old updates, and replace or remove photos and video embeds from the update form.")}
          <div className="grid gap-4 md:grid-cols-2">
            {draft.updates.map((update) => (
              <article key={update.id} className="rounded-[1.5rem] bg-paper/60 p-5 ring-1 ring-ink/10">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-bamboo">{update.date}</p>
                <h3 className="mt-2 text-2xl text-ink">{update.subject}</h3>
                <p className="mt-2 text-sm text-charcoal/70">{update.summary}</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="btn-secondary" onClick={() => editUpdate(update)}>
                    Edit
                  </button>
                  <button type="button" className="btn-secondary text-vermilion" onClick={() => setDeleteId(update.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("7. Save / Publish Changes", "Send the prepared content to the serverless publish endpoint so it can commit to GitHub and trigger deployment.")}
          <button type="button" onClick={publish} className="btn-primary">
            <Save size={18} aria-hidden="true" />
            Save / Publish Changes
          </button>
        </section>
      </div>

      {deleteId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-5">
          <div className="max-w-md rounded-[2rem] bg-paper p-7 shadow-soft">
            <h2 className="text-3xl text-ink">Delete this update?</h2>
            <p className="mt-3 text-sm text-charcoal/72">This removes the update from the current admin draft. It will not affect GitHub until Save / Publish succeeds.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" className="btn-primary" onClick={confirmDeleteUpdate}>
                Delete
              </button>
              <button type="button" className="btn-secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
