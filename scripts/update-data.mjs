#!/usr/bin/env node
// Daily refresh of data/live.json: live signals about AI distillation from
// arXiv, Hugging Face, GitHub and Hacker News. Node 22, no dependencies.
// Each source is isolated: a failure is recorded in `errors` and the previous
// value for that source (from the existing data/live.json) is kept.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = new URL("../data/live.json", import.meta.url);
const UA = "global-distillation/0.1 (https://github.com/hales/global-distillation)";
const TIMEOUT_MS = 20_000;
const ARXIV_DELAY_MS = 3_000; // arXiv API policy: one request every 3 s
const FIRST_YEAR = 2015;

const TRACKED_MODELS = [
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
  "distilbert/distilbert-base-uncased",
  "Qwen/Qwen3-8B",
  "google/gemma-3-4b-it",
  "meta-llama/Llama-3.2-3B-Instruct",
  "microsoft/Phi-4-mini-instruct",
  "HuggingFaceTB/SmolLM3-3B",
];
const REPOS = [
  "huggingface/trl", "arcee-ai/DistillKit", "pytorch/torchtune", "NVIDIA/NeMo",
  "axolotl-ai-cloud/axolotl", "unslothai/unsloth", "hiyouga/LLaMA-Factory",
  "vllm-project/vllm", "sgl-project/sglang", "huggingface/open-r1",
  "open-thoughts/open-thoughts", "EleutherAI/lm-evaluation-harness",
  "SafeAILab/EAGLE", "NovaSky-AI/SkyThought", "simplescaling/s1",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...headers },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}
const getJSON = (url, headers) => request(url, headers).then((r) => r.json());
const getText = (url, headers) => request(url, headers).then((r) => r.text());

// ---------- arXiv ----------
const ARXIV = "https://export.arxiv.org/api/query";
const KD = 'all:"knowledge distillation"';
const arxivUrl = (q, max) =>
  `${ARXIV}?search_query=${encodeURIComponent(q)}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
const totalOf = (xml) => Number(xml.match(/<opensearch:totalResults>(\d+)</)?.[1] ?? NaN);
const tag = (xml, name) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function fetchArxiv() {
  const first = await getText(arxivUrl(KD, 12));
  const totalKD = totalOf(first);
  if (!Number.isFinite(totalKD) || totalKD === 0) throw new Error("arXiv returned no totalResults");
  const recent = [...first.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: clean(tag(e, "title")),
    url: clean(tag(e, "id")),
    published: clean(tag(e, "published")),
    authors: [...e.matchAll(/<name>([^<]*)<\/name>/g)].slice(0, 3).map((m) => clean(m[1])),
  }));

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  await sleep(ARXIV_DELAY_MS);
  const last30d = totalOf(
    await getText(arxivUrl(`${KD} AND submittedDate:[${ymd(since)}0000 TO ${ymd(now)}2359]`, 1)),
  );

  const perYear = [];
  for (let year = FIRST_YEAR; year <= now.getUTCFullYear(); year++) {
    await sleep(ARXIV_DELAY_MS);
    const xml = await getText(arxivUrl(`${KD} AND submittedDate:[${year}01010000 TO ${year}12312359]`, 1));
    perYear.push({ year, count: totalOf(xml) });
  }
  return { totalKD, last30d, perYear, recent };
}

// ---------- Hugging Face ----------
const HF = "https://huggingface.co/api/models";
const hfModel = (m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0, url: `https://huggingface.co/${m.id}` });

async function fetchHuggingFace(prev, errors) {
  const top = (await getJSON(`${HF}?search=distill&sort=downloads&direction=-1&limit=15`)).map(hfModel);

  const tracked = [];
  for (const id of TRACKED_MODELS) {
    try {
      tracked.push(hfModel(await getJSON(`${HF}/${id}`)));
    } catch (e) {
      if (!/HTTP 404/.test(e.message)) errors.push(`huggingface tracked ${id}: ${e.message}`);
    }
  }

  let distillModels = prev?.distillModels ?? null;
  const probe = await request(`${HF}?search=distill&limit=1`);
  if (probe.headers.get("x-total-count")) {
    distillModels = Number(probe.headers.get("x-total-count"));
  } else {
    // No total header: walk the cursor-paginated list (~17 pages at the time of writing).
    let url = `${HF}?search=distill&limit=1000`, count = 0, pages = 0;
    while (url && pages < 25) {
      const res = await request(url);
      count += (await res.json()).length;
      pages++;
      url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    }
    if (url) errors.push(`huggingface distillModels: >${count} models, paging cap hit; kept previous value`);
    else distillModels = count;
  }
  return { distillModels, top, tracked };
}

// ---------- GitHub ----------
async function fetchGitHub() {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repos = [];
  for (const repo of REPOS) {
    const r = await getJSON(`https://api.github.com/repos/${repo}`, headers);
    repos.push({ repo, stars: r.stargazers_count, forks: r.forks_count, pushedAt: r.pushed_at, url: r.html_url });
  }
  return { repos };
}

// ---------- Hacker News ----------
// 30 hits per query so the merged, deduped list still fills 20 items.
async function fetchNews() {
  const hn = (q) => getJSON(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=30`);
  const [a, b] = await Promise.all([hn('"distillation" AI'), hn('"distilled model"')]);
  const seen = new Set();
  const items = [];
  for (const h of [...a.hits, ...b.hits]) {
    const url = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    const key = url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let source = "news.ycombinator.com";
    try { source = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    items.push({ title: h.title, url, source, points: h.points ?? 0, date: h.created_at });
  }
  items.sort((x, y) => y.date.localeCompare(x.date));
  return { items: items.slice(0, 20) };
}

// ---------- main ----------
let prev = {};
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}

const errors = [];
const out = { updated: new Date().toISOString(), generatedBy: "scripts/update-data.mjs" };

async function source(name, fn) {
  try {
    out[name] = await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    out[name] = prev[name] ?? null;
    console.log(`FAIL ${name}: ${e.message}${prev[name] ? " (kept previous value)" : ""}`);
  }
}

// arXiv is slow (rate-limited); run the others concurrently with it.
await Promise.all([
  source("arxiv", fetchArxiv),
  (async () => {
    await source("huggingface", () => fetchHuggingFace(prev.huggingface, errors));
    await source("github", fetchGitHub);
    await source("news", fetchNews);
  })(),
]);
const { updated, generatedBy, arxiv, huggingface, github, news } = out;
await writeFile(OUT, JSON.stringify({ updated, generatedBy, arxiv, huggingface, github, news, errors }, null, 2) + "\n");

console.log(`
Summary (${out.updated})
  arXiv        total ${arxiv?.totalKD ?? "-"} | last 30d ${arxiv?.last30d ?? "-"} | years ${arxiv?.perYear?.length ?? 0} | recent ${arxiv?.recent?.length ?? 0}
  Hugging Face distill models ${huggingface?.distillModels ?? "-"} | top ${huggingface?.top?.length ?? 0} | tracked ${huggingface?.tracked?.length ?? 0}
  GitHub       repos ${github?.repos?.length ?? 0}
  Hacker News  items ${news?.items?.length ?? 0}
  errors       ${errors.length ? "\n    " + errors.join("\n    ") : "none"}
Wrote ${fileURLToPath(OUT)}`);
