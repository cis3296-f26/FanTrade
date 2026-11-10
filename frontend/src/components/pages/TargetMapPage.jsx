import useScrollReveal from "../../hooks/useScrollReveal";
import TargetMap from "../field/TargetMap";
import "./TargetMapPage.css";

export default function TargetMapPage() {
  useScrollReveal();

  return (
    <div className="target-map-page">
      <main className="target-map-main reveal">
        <TargetMap />
      </main>
    </div>
  );
}
