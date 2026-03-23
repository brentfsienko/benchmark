import { Suspense } from "react";
import { loadChallengeData } from "./load-challenge-data";
import { ChallengeContent } from "./challenge-content";

async function ChallengesLoader() {
  const data = await loadChallengeData();
  return <ChallengeContent data={data} />;
}

export default function ChallengesPage() {
  return (
    <Suspense fallback={<section className="screen"><p className="muted">loading…</p></section>}>
      <ChallengesLoader />
    </Suspense>
  );
}
