import type { Project } from "../project-schema/project";
import "./generation-completeness.css";
import {
  completenessProfiles,
  reviewGenerationCompleteness,
  type CompletenessProfile,
} from "../ai/generation-standards";

export function GenerationCompleteness({
  project,
  profile,
}: {
  project: Project;
  profile: CompletenessProfile;
}) {
  const review = reviewGenerationCompleteness(project, profile);
  const present = review.checks.filter((check) => check.present).length;
  return (
    <section
      aria-label="Pemeriksaan kelengkapan"
      className="generation-completeness"
    >
      <h4>
        Kelengkapan ·{" "}
        {completenessProfiles.find((item) => item.id === profile)?.label}
      </h4>
      <p>
        {present} dari {review.checks.length} bagian standar tersedia.
      </p>
      <ul>
        {review.checks.map((check) => (
          <li
            key={check.id}
            data-completeness={check.present ? "present" : "missing"}
          >
            <strong>{check.present ? "Tersedia" : "Belum tersedia"}</strong> —{" "}
            {check.label}
          </li>
        ))}
      </ul>
      {review.needsContent.length > 0 && (
        <>
          <h5>Materi yang perlu dilengkapi</h5>
          <ul>
            {review.needsContent.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p className="manager-help">
        Pemeriksaan struktur, bukan jaminan siap publikasi. Sesuaikan dengan
        brief: bagian yang sengaja tidak diminta boleh dilewati. Anda tetap bisa
        mengedit dan menyimpan draf.
      </p>
    </section>
  );
}
