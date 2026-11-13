// MapPicker.jsx: sora el south pole fe Leaflet. el coordinates = metr (y, x)
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BASE, get } from "./api";

export default function MapPicker({ sites, current, onPick }) {
  const div = useRef(null), map = useRef(null), pins = useRef(null), pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;                            // StrictMode beyshaghal el effect marrtein
    get("/mapinfo").then((info) => {
      if (cancelled) return;
      const b = info.bounds;
      const bounds = [[b.bottom, b.left], [b.top, b.right]];   // [[ymin,xmin],[ymax,xmax]]
      const m = L.map(div.current, { crs: L.CRS.Simple, minZoom: -11, maxZoom: -3, zoomSnap: 0.25, attributionControl: false });
      L.imageOverlay(BASE + info.image, bounds).addTo(m);
      m.fitBounds(bounds);
      m.on("click", (e) => pickRef.current(e.latlng.lng, e.latlng.lat));   // lng = x, lat = y
      pins.current = L.layerGroup().addTo(m);
      map.current = m;
      drawPins();
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  function drawPins() {
    if (!pins.current) return;
    pins.current.clearLayers();
    for (const s of sites) {
      L.circleMarker([s.y, s.x], { radius: 6, color: "#ffb347", weight: 2, fillOpacity: 0.6 })
        .bindTooltip(`${s.name} · ${s.percent_sunlit}% sunlit`).addTo(pins.current);
    }
    if (current?.custom) L.circleMarker([current.y, current.x], { radius: 7, color: "#fff", weight: 2 }).addTo(pins.current);
  }

  useEffect(() => {
    drawPins();
    if (map.current && current) map.current.flyTo([current.y, current.x], Math.max(map.current.getZoom(), -7));
  }, [sites, current]);

  return <div ref={div} style={{ width: "100%", height: "100%", background: "#000" }} />;
}
