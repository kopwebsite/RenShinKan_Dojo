import {
  CheckCircle2,
  FileImage,
  FileText,
  FileUp,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

export type PaymentProofAccess = { proofId: string; uploadToken: string };
const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function PaymentProofUpload({ access, paymentLabel, replacement = false, onUploaded }: {
  access: PaymentProofAccess;
  paymentLabel: string;
  replacement?: boolean;
  onUploaded?: () => void;
}) {
  const { language, t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function chooseFile(next?: File) {
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    setFile(null);
    if (!next) return;
    if (!PROOF_TYPES.has(next.type)) {
      setError(t("paymentProof.invalidType"));
      return;
    }
    if (next.size <= 0 || next.size > MAX_PROOF_SIZE) {
      setError(t("paymentProof.tooLarge"));
      return;
    }
    setFile(next);
    if (next.type.startsWith("image/")) setPreview(URL.createObjectURL(next));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("proofId", access.proofId);
      form.set("uploadToken", access.uploadToken);
      form.set("file", file);
      const response = await fetch("/api/payment-proofs", { method: "POST", headers: { "X-Request-ID": crypto.randomUUID() }, body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(language === "en" && body.error ? body.error : t("paymentProof.uploadError"));
      setMessage(t("paymentProof.submitted"));
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      setFile(null);
      onUploaded?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("paymentProof.uploadError"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (message) return <section className="payment-proof-upload payment-proof-upload--complete" aria-live="polite">
    <div className="payment-proof-upload__heading"><CheckCircle2 aria-hidden="true" /><div><p className="eyebrow">{t("paymentProof.uploadComplete")}</p><h4>{t("paymentProof.received")}</h4><p>{message}</p></div></div>
    <div className="payment-proof-upload__next"><ShieldCheck aria-hidden="true" /><p><strong>{t("paymentProof.whatNext")}</strong><span>{t("paymentProof.reviewNext")}</span></p></div>
    <small><ShieldCheck size={14} /> {t("paymentProof.privateRecord")}</small>
  </section>;

  return (
    <section className="payment-proof-upload" aria-live="polite">
      <div className="payment-proof-upload__heading">
        <FileUp aria-hidden="true" />
        <div>
          <p className="eyebrow">{t("paymentProof.confirmation")}</p>
          <h4>
            {replacement ? t("paymentProof.replace") : t("paymentProof.upload")}
          </h4>
          <p>{t("paymentProof.cannotConfirm", { payment: paymentLabel })}</p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hidden
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {file ? (
        <div className="payment-proof-upload__preview">
          {preview ? (
            <img src={preview} alt={t("paymentProof.previewAlt")} />
          ) : (
            <span aria-hidden="true">
              <FileText />
            </span>
          )}
          <div>
            <strong>{file.name}</strong>
            <small>
              {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {file.type === "application/pdf"
                ? "PDF"
                : t("paymentProof.imageFile")}
            </small>
          </div>
          <div>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <RefreshCw size={15} /> {t("paymentProof.replaceFile")}
            </button>
            <button
              type="button"
              className="btn-secondary is-danger"
              disabled={busy}
              onClick={() => chooseFile()}
            >
              <Trash2 size={15} /> {t("paymentProof.removeFile")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="payment-proof-upload__action">
        {!file ? (
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <FileImage size={17} />
            {replacement
              ? t("paymentProof.chooseReplacement")
              : t("paymentProof.chooseFile")}
          </button>
        ) : (
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void upload()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <FileUp size={17} />
            )}
            {busy
              ? t("paymentProof.uploading")
              : t("paymentProof.uploadSelected")}
          </button>
        )}
        <small>
          <ShieldCheck size={14} /> {t("paymentProof.fileHelp")}
        </small>
      </div>
      <p className="payment-proof-upload__fallback">
        <strong>{t("paymentProof.cannotUpload")}</strong>{" "}
        {t("paymentProof.contactSensei")}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
