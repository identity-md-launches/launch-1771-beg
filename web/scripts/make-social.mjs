import { writeFile } from "node:fs/promises";
let seed = 1771;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
let dots = "";
for (let i = 0; i < 3600; i++) {
  const x = rand() * 540 - 270,
    y = rand() * 300 - 150;
  const edge = (Math.abs(x) / 270) ** 1.4 + (Math.abs(y) / 142) ** 1.7;
  const r = Math.hypot(x, y);
  if (
    (edge < 1 && edge > 0.72) ||
    (r > 50 && r < 105) ||
    (edge < 1 && rand() < 0.08)
  )
    dots += `<circle cx="${850 + x}" cy="${290 + y}" r="${rand() * 1.4 + 0.7}" fill="${r < 60 ? "#FFC83D" : "#A99DFF"}" opacity="${rand() * 0.65 + 0.3}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#07070B"/><defs><radialGradient id="g"><stop stop-color="#8B7BFF" stop-opacity=".19"/><stop offset="1" stop-color="#8B7BFF" stop-opacity="0"/></radialGradient></defs><ellipse cx="850" cy="290" rx="330" ry="230" fill="url(#g)"/>${dots}<circle cx="850" cy="290" r="25" fill="#07070B"/><path d="M838 290h24m-12-12v24" stroke="#FFC83D"/><g font-family="Arial,sans-serif" fill="#F4F1EA"><text x="64" y="80" font-size="34" font-weight="bold">beg<tspan fill="#FFC83D">.</tspan></text><text x="64" y="255" font-size="92" font-weight="bold" letter-spacing="-5">Beg the</text><text x="64" y="352" font-size="92" font-weight="bold" letter-spacing="-5">Swarm<tspan fill="#FFC83D">.</tspan></text><text x="68" y="415" fill="#A6A4B3" font-size="24">Convince the IMD swarm to give you tokens.</text><text x="68" y="452" fill="#A6A4B3" font-size="24">It reads everything.</text><path d="M64 532h1072" stroke="#2B2B36"/><text x="68" y="577" font-size="20" fill="#FFC83D">$BEG on Ethereum</text><text x="875" y="577" font-size="20" fill="#A99DFF">280 bytes. One swarm.</text></g></svg>`;
await writeFile(new URL("../design/social.svg", import.meta.url), svg);
