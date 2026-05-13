type CsvRow = Record<string, string>;

export type DnRecord = {
  nom: string;
  prenom: string;
  displayName: string;   // "EINSTEIN Albert"
  ownerTitle: string;    // "Albert EINSTEIN"
  dateRaw: string;
  timeRaw: string;
  date: string | null;   // "dd-mm-yyyy"
  time: string | null;   // "hh:mm"
  lieu: string;
  pays: string;
  lat: number | null;
  lon: number | null;
  source: string;
  searchKeys: string[];
};

function normalizeText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim());
}

function detectDelimiter(text: string) {
  const firstLine =
    text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) || "";

  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes("|")) return "|";
  return ",";
}

function parseCsv(text: string): CsvRow[] {
  const delimiter = detectDelimiter(text);
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0], delimiter);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i], delimiter);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function parseDnDate(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;

  const m1 = s.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (m1) {
    const d = Number(m1[1]);
    const m = Number(m1[2]);
    const y = Number(m1[3]);
    return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${String(y)}`;
  }

  const compact = s.replace(/\D/g, "");
  const m2 = compact.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }

  return null;
}

function parseDnTime(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;

  const m = s.match(/(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseDnCoord(input: string, isLat: boolean): number | null {
  const s = (input || "").trim();
  if (!s) return null;

  const hemiDecimal = s.match(/^([+-]?\d+(?:[.,]\d+)?)([NSEW])$/i);
  if (hemiDecimal) {
    let value = Number(hemiDecimal[1].replace(",", "."));
    if (!Number.isFinite(value)) return null;
    const hemi = hemiDecimal[2].toUpperCase();
    if (hemi === "S" || hemi === "W") value = -value;
    return value;
  }

  const simple = Number(s.replace(",", "."));
  if (Number.isFinite(simple)) return simple;

  if (/e\+/i.test(s)) return null;

  const upper = s.toUpperCase();
  const hemi = upper.match(/[NSEW]/)?.[0] ?? null;
  const nums = upper.match(/\d+/g);
  if (!nums?.length) return null;

  let deg = Number(nums[0]);
  let min = 0;
  let sec = 0;

  if (nums.length >= 2) {
    if (nums[1].length === 4) {
      min = Number(nums[1].slice(0, 2));
      sec = Number(nums[1].slice(2, 4));
    } else {
      min = Number(nums[1]);
      sec = nums[2] ? Number(nums[2]) : 0;
    }
  }

  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) {
    return null;
  }
  if (min < 0 || min > 59 || sec < 0 || sec > 59) {
    return null;
  }

  let value = deg + min / 60 + sec / 3600;
  if (hemi === "S" || hemi === "W") value = -value;

  if (isLat && (value < -90 || value > 90)) return null;
  if (!isLat && (value < -180 || value > 180)) return null;

  return value;
}

function alphaKey(rec: DnRecord) {
  return [
    normalizeText(rec.nom),
    normalizeText(rec.prenom),
    normalizeText(rec.displayName),
  ].join("|");
}

export function lonToLmtTz(lon: number): string {
  if (!Number.isFinite(lon)) return "";
  const totalMinutes = Math.round(lon * 4);
  const sign = totalMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(totalMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function loadDnDatabase(): Promise<DnRecord[]> {
  const res = await fetch("/data/dn_database.csv", { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`DN CSV introuvable (${res.status})`);
  }

  const text = await res.text();
  const rows = parseCsv(text);

  return rows
    .map((row): DnRecord | null => {
      const nom = (row["NOM"] || row["Nom"] || row["nom"] || "").trim();
      const prenom =
        (row["Prénom"] || row["Prenom"] || row["PRENOM"] || row["prenom"] || "").trim();
      const dateRaw = (row["Date"] || row["date"] || "").trim();
      const timeRaw = (row["Heure"] || row["heure"] || "").trim();
      const lieu = (row["Lieu"] || row["Ville"] || row["ville"] || "").trim();
      const pays = (row["Pays"] || row["pays"] || "").trim();
      const latRaw = (row["Latitude"] || row["lat"] || row["latitude"] || "").trim();
      const lonRaw = (row["Longitude"] || row["lon"] || row["longitude"] || "").trim();
      const source = (row["Source"] || row["source"] || row["SOURCE"] || "").trim();

      if (!nom && !prenom) return null;

      const displayName = [nom, prenom].filter(Boolean).join(" ").trim();
      const ownerTitle = [prenom, nom].filter(Boolean).join(" ").trim();

      const date = parseDnDate(dateRaw);
      const time = parseDnTime(timeRaw);
      const lat = latRaw ? parseDnCoord(latRaw, true) : null;
      const lon = lonRaw ? parseDnCoord(lonRaw, false) : null;

      const searchKeys = Array.from(
        new Set(
          [
            [nom, prenom].filter(Boolean).join(" "),
            [prenom, nom].filter(Boolean).join(" "),
            nom,
            prenom,
          ]
            .map(normalizeText)
            .filter(Boolean)
        )
      );

      return {
        nom,
        prenom,
        displayName,
        ownerTitle,
        dateRaw,
        timeRaw,
        date,
        time,
        lieu,
        pays,
        lat,
        lon,
        source,
        searchKeys,
      };
    })
    .filter((row): row is DnRecord => !!row);
}

export function searchDnRecords(records: DnRecord[], query: string): DnRecord[] {
  const q = normalizeText(query);
  if (!q || q.length < 2) return [];

  const words = q.split(" ").filter(Boolean);

  const nomExact: DnRecord[] = [];
  const nomPrefix: DnRecord[] = [];
  const prenomExact: DnRecord[] = [];
  const prenomPrefix: DnRecord[] = [];
  const allWordsPrefix: DnRecord[] = [];
  const allWordsContains: DnRecord[] = [];

  const seen = new Set<string>();

  const pushUnique = (bucket: DnRecord[], rec: DnRecord) => {
    const key = `${rec.nom}|${rec.prenom}|${rec.dateRaw}|${rec.timeRaw}|${rec.lieu}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push(rec);
  };

  for (const rec of records) {
    const nom = normalizeText(rec.nom);
    const prenom = normalizeText(rec.prenom);
    const keys = rec.searchKeys;

    if (words.length === 1) {
      if (nom === q) {
        pushUnique(nomExact, rec);
        continue;
      }
      if (nom.startsWith(q)) {
        pushUnique(nomPrefix, rec);
        continue;
      }
      if (prenom === q) {
        pushUnique(prenomExact, rec);
        continue;
      }
      if (prenom.startsWith(q)) {
        pushUnique(prenomPrefix, rec);
        continue;
      }
      if (keys.some((k) => k.includes(q))) {
        pushUnique(allWordsContains, rec);
      }
      continue;
    }

    if (keys.includes(q)) {
      pushUnique(allWordsPrefix, rec);
      continue;
    }

    if (keys.some((k) => k.startsWith(q))) {
      pushUnique(allWordsPrefix, rec);
      continue;
    }

    if (words.every((word) => keys.some((k) => k.includes(word)))) {
      pushUnique(allWordsContains, rec);
    }
  }

  const sorter = (a: DnRecord, b: DnRecord) => alphaKey(a).localeCompare(alphaKey(b));

  nomExact.sort(sorter);
  nomPrefix.sort(sorter);
  prenomExact.sort(sorter);
  prenomPrefix.sort(sorter);
  allWordsPrefix.sort(sorter);
  allWordsContains.sort(sorter);

  return [
    ...nomExact,
    ...nomPrefix,
    ...prenomExact,
    ...prenomPrefix,
    ...allWordsPrefix,
    ...allWordsContains,
  ].slice(0, 30);
}

export function buildDnSubLabel(rec: DnRecord) {
  const parts: string[] = [];

  if (rec.date) {
    const [dd, mm, yyyy] = rec.date.split("-");
    parts.push(`${dd}/${mm}/${yyyy}`);
  } else if (rec.dateRaw) {
    parts.push(rec.dateRaw);
  }

  if (rec.time) {
    parts.push(rec.time);
  } else if (rec.timeRaw) {
    parts.push(rec.timeRaw);
  }

  const place = [rec.lieu, rec.pays].filter(Boolean).join(", ");
  if (place) parts.push(place);

  return parts.join(" — ");
}