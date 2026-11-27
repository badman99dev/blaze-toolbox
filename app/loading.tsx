import { Shell } from "@/components/Shell";
import { Loader } from "@/components/Loader";

export default function Loading() {
  return (
    <Shell>
      <Loader label="Opening…" />
    </Shell>
  );
}
