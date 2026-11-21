"use client";

import Image from "next/image";
import Link from "next/link";
import AppPrompt from "../components/AppPrompt";
import { isInstalled, openInstall } from "../lib/install";
import DonationInvite from "../components/DonationInvite";
import { SITE } from "../lib/site";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Church,
  Copy,
  Crosshair,
  Download,
  Flag,
  Globe2,
  Heart,
  Info,
  LoaderCircle,
  MapPin,
  MapPinned,
  Navigation,
  Plus,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ChurchItem,
  type Service,
  googleMapsRouteUrl,
  hasCoordinates,
  hasVerifiedPosition,
  reportErrorUrl,
  wazeRouteUrl,
} from "../lib/churches";
import { formatAccuracy, formatDistance, geocodeUncertainty, straightLineKm } from "../lib/geo";
import { LOCATION_FAILURE_MESSAGES, LocationError, getDevicePosition } from "../lib/location";
import { DAYS, PERIODS, type Period, isPeriod, periodFor } from "../lib/schedule";
import { STATES } from "../lib/states";

type SavedPlace = { id: string; name: string; address: string; latitude: number; longitude: number; accuracy?: number };
type View = "explore" | "favorites" | "archived";
type ResultItem = { church: ChurchItem; distanceKm: number | null; matching: Service[] };
type Search = {
  key: string;
  status: "idle" | "ready" | "error";
  items: ResultItem[];
  total: number;
  unlocatedNearby: ResultItem[];
  others: Array<{ church: ChurchItem; distanceKm: number; days: string[] }>;
};
// Distâncias de carro já obtidas para um ponto de saída; "failed": o serviço de rotas não respondeu (mostra linha reta, marcada como estimativa).
type Roads = { originKey: string; failed: boolean; values: Record<string, number> };
type Places = { updatedAt: string; total: number; states: Record<string, { count: number; cities: Record<string, number> }> };

const MAX_LOCATION_ACCURACY_METERS = 500;
// Acima disso o ponto de saída é tratado como aproximado e a tela avisa.
const APPROXIMATE_ORIGIN_METERS = 250;
const PAGE_SIZE = 12;
const FETCH_SIZE = 24;
const EMPTY_SEARCH: Search = { key: "", status: "idle", items: [], total: 0, unlocatedNearby: [], others: [] };

const VIEWS: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "explore", label: "Buscar", icon: Search },
  { id: "favorites", label: "Favoritos", icon: Star },
  { id: "archived", label: "Arquivados", icon: Archive },
];

const EMPTY_STATES: Record<View, { title: string; text: string }> = {
  explore: { title: "Nenhuma casa encontrada", text: "Tente outro dia, período ou termo de busca." },
  favorites: { title: "Nenhum favorito neste filtro", text: "Toque na estrela de uma casa de oração para guardá-la aqui. Favoritos sem culto no dia escolhido ficam ocultos." },
  archived: { title: "Nenhuma casa arquivada neste filtro", text: "Casas arquivadas saem da busca e podem ser restauradas por aqui." },
};

const POSITION_NOTES: Record<string, string> = {
  verified: "Posição confirmada no mapa. A rota abre direto no ponto da casa de oração.",
  approximate: "Só há uma posição aproximada no mapa, que não foi confirmada como sendo a da casa de oração.",
  unavailable: "O mapa não traz uma posição confiável para esta casa.",
};

const localDateKey = () => new Date().toLocaleDateString("sv-SE");
const formatDate = (value: string) => value.split("-").reverse().join("/");
const addressLine = (church: ChurchItem) => `${church.name} — ${church.address} — ${church.city}/${church.state}`;

function useStoredSet(key: string) {
  const [items, setItems] = useState<Set<string>>(new Set());
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setItems(new Set(JSON.parse(localStorage.getItem(key) || "[]"))); } catch { setItems(new Set()); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  const update = (id: string) => setItems((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem(key, JSON.stringify([...next]));
    return next;
  });
  const clear = () => { localStorage.setItem(key, "[]"); setItems(new Set()); };
  return { items, update, clear };
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CopyAddress({ church }: { church: ChurchItem }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addressLine(church));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* sem permissão para a área de transferência */ }
  };
  return <button type="button" className="copy-address" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Endereço copiado" : "Copiar endereço"}</button>;
}

function RouteActions({ church, origin, className = "" }: { church: ChurchItem; origin: SavedPlace | null; className?: string }) {
  if (!hasVerifiedPosition(church)) {
    // Sem posição conferida não há rota: melhor indisponível do que mandar alguém ao endereço errado.
    return <div className={`route-unavailable ${className}`} onClick={(event) => event.stopPropagation()}>
      <p><TriangleAlert size={16} /> <span><b>Rota indisponível.</b> A posição no mapa não foi confirmada. Confira o endereço oficial.</span></p>
      <CopyAddress church={church} />
    </div>;
  }
  // Na localização atual o Maps parte da posição ao vivo, mais fiel do que a leitura já feita.
  const mapsOrigin = origin && origin.id !== "current" ? origin : null;
  return <div className={`route-actions ${className}`} onClick={(event) => event.stopPropagation()}>
    <a className="waze-button" href={wazeRouteUrl(church)} target="_blank" rel="noreferrer"><Navigation size={17} fill="currentColor" /> Waze <ArrowUpRight size={14} /></a>
    <a className="maps-button" href={googleMapsRouteUrl(church, mapsOrigin)} target="_blank" rel="noreferrer"><MapPin size={17} /> Google Maps <ArrowUpRight size={14} /></a>
  </div>;
}

export default function Home() {
  const [today, setToday] = useState<string | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [installable, setInstallable] = useState(false);
  const [day, setDay] = useState("Dom");
  const [period, setPeriod] = useState<Period>("Todos");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("explore");
  const [origin, setOrigin] = useState<SavedPlace | null>(null);
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [meta, setMeta] = useState<Places | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedChurch, setSelectedChurch] = useState<ChurchItem | null>(null);
  const [fetched, setFetched] = useState<Search>(EMPTY_SEARCH);
  const [saved, setSaved] = useState<ChurchItem[]>([]);
  const [roadState, setRoadState] = useState<Roads>({ originKey: "", failed: false, values: {} });
  const [attempt, setAttempt] = useState(0);
  const favorites = useStoredSet("ccb-favorites");
  const archived = useStoredSet("ccb-archived");
  const modalOpen = locationOpen || selectedChurch !== null;
  const closeModalRef = useRef<() => boolean>(() => false);
  const debouncedQuery = useDebounced(query, 300);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashVisible(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    closeModalRef.current = () => {
      if (!modalOpen) return false;
      setLocationOpen(false);
      setSelectedChurch(null);
      return true;
    };
  }, [modalOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentDay = DAYS[new Date().getDay()].short;
      setToday(currentDay);
      setInstallable(!isInstalled());
      setDay(currentDay);
      try {
        setPlaces(JSON.parse(localStorage.getItem("ccb-places") || "[]"));
        const selected = localStorage.getItem("ccb-origin");
        if (selected) {
          const savedOrigin = JSON.parse(selected) as SavedPlace;
          if (savedOrigin.id === "current") localStorage.removeItem("ccb-origin");
          else setOrigin(savedOrigin);
        }
        const region = JSON.parse(localStorage.getItem("ccb-region") || "null");
        if (typeof region?.uf === "string" && STATES.some((state) => state.uf === region.uf)) {
          setUf(region.uf);
          if (typeof region.city === "string") setCity(region.city);
        }
        const filters = JSON.parse(localStorage.getItem("ccb-filters") || "null");
        // O dia só é restaurado na mesma data; em um novo dia a busca volta para "hoje".
        if (filters?.day && filters.savedOn === localDateKey()) setDay(filters.day);
        if (isPeriod(filters?.period)) setPeriod(filters.period);
      } catch { /* ignora preferências locais inválidas */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/places").then((response) => (response.ok ? response.json() : null)).then((data) => data && setMeta(data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (today) localStorage.setItem("ccb-filters", JSON.stringify({ day, period, savedOn: localDateKey() }));
  }, [today, day, period]);

  useEffect(() => {
    if (today) localStorage.setItem("ccb-region", JSON.stringify({ uf, city }));
  }, [today, uf, city]);

  // Busca no servidor: com ponto de saída, as mais próximas do país todo; sem ele, a região escolhida.
  const searchKey = `${origin ? `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}` : `${uf}/${city}`}|${day}|${period}|${debouncedQuery.trim()}`;
  const wantedKey = today && view === "explore" && (origin || uf) ? `${searchKey}|${attempt}` : "";
  const searchParams = useCallback((offset: number) => {
    const params = new URLSearchParams({ day, period, limit: String(FETCH_SIZE), offset: String(offset) });
    if (origin) { params.set("lat", String(origin.latitude)); params.set("lng", String(origin.longitude)); }
    else { params.set("uf", uf); if (city) params.set("city", city); }
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    return params;
  }, [origin, uf, city, day, period, debouncedQuery]);
  useEffect(() => {
    if (!wantedKey) return;
    const controller = new AbortController();
    fetch(`/api/churches?${searchParams(0)}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("falha"); return response.json() as Promise<Pick<Search, "items" | "total" | "unlocatedNearby" | "others">>; })
      .then((data) => setFetched({ key: wantedKey, status: "ready", items: data.items, total: data.total, unlocatedNearby: data.unlocatedNearby, others: data.others }))
      .catch(() => { if (!controller.signal.aborted) setFetched({ ...EMPTY_SEARCH, key: wantedKey, status: "error" }); });
    return () => controller.abort();
    // wantedKey resume todas as entradas da busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);
  const search = fetched.key === wantedKey ? fetched : EMPTY_SEARCH;
  const searching = wantedKey !== "" && fetched.key !== wantedKey;

  const loadMore = async () => {
    try {
      const response = await fetch(`/api/churches?${searchParams(search.items.length)}`);
      if (!response.ok) throw new Error("falha");
      const data = await response.json() as Pick<Search, "items" | "total">;
      setFetched((current) => ({ ...current, items: [...current.items, ...data.items.filter((item) => !current.items.some((known) => known.church.id === item.church.id))], total: data.total }));
    } catch { setFetched((current) => ({ ...current, status: "error" })); }
  };

  // Favoritos e arquivados: buscados pelo código, já que a base é grande demais para ficar no aparelho.
  const savedIds = view === "favorites" ? [...favorites.items] : view === "archived" ? [...archived.items] : [];
  const savedKey = savedIds.sort().join(",");
  useEffect(() => {
    if (!savedKey) return;
    const controller = new AbortController();
    fetch(`/api/churches?ids=${encodeURIComponent(savedKey)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("falha"))))
      .then((data: { churches: ChurchItem[] }) => setSaved(data.churches))
      .catch(() => { if (!controller.signal.aborted) setSaved([]); });
    return () => controller.abort();
  }, [savedKey]);
  const savedChurches = useMemo(() => (savedKey ? saved : []), [savedKey, saved]);

  const results: ResultItem[] = useMemo(() => {
    if (view === "explore") return search.items.filter(({ church }) => !archived.items.has(church.id));
    return savedChurches
      .map((church) => ({
        church,
        matching: church.services.filter((service) => service.day === day && (period === "Todos" || periodFor(service.time) === period)),
        distanceKm: origin && hasCoordinates(church) ? straightLineKm(origin, church) : null,
      }))
      .filter(({ matching }) => matching.length > 0)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.church.name.localeCompare(b.church.name, "pt-BR"));
  }, [view, search.items, savedChurches, day, period, origin, archived.items]);

  // Trajeto de carro (OSRM) para as casas exibidas que têm posição; a ordem final usa essa distância.
  const roadKey = origin ? `${origin.latitude},${origin.longitude}` : "";
  const roads = roadState.originKey === roadKey ? roadState : { originKey: roadKey, failed: false, values: {} };
  const missingRoad = results.filter(({ church }) => hasCoordinates(church) && roads.values[church.id] === undefined).slice(0, 45);
  const missingKey = missingRoad.map(({ church }) => church.id).join(",");
  const roadStatus = !origin ? "idle" : roads.failed ? "failed" : missingKey ? "loading" : "road";
  useEffect(() => {
    if (!origin || !missingKey || roads.failed) return;
    const controller = new AbortController();
    const destinations = missingRoad.flatMap(({ church }) => hasCoordinates(church) ? [{ id: church.id, latitude: church.latitude, longitude: church.longitude }] : []);
    fetch("/api/distances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { latitude: origin.latitude, longitude: origin.longitude }, destinations }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao calcular rotas");
        return response.json() as Promise<{ distances: Record<string, number> }>;
      })
      .then(({ distances }) => setRoadState((current) => ({ originKey: roadKey, failed: false, values: { ...(current.originKey === roadKey ? current.values : {}), ...distances } })))
      .catch(() => { if (!controller.signal.aborted) setRoadState((current) => ({ originKey: roadKey, failed: true, values: current.originKey === roadKey ? current.values : {} })); });
    return () => controller.abort();
    // missingKey resume os destinos pendentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadKey, missingKey, roads.failed]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeModalRef.current(); };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [modalOpen]);

  const selectOrigin = (place: SavedPlace, persist = true) => {
    setOrigin(place);
    setVisibleCount(PAGE_SIZE);
    if (persist) localStorage.setItem("ccb-origin", JSON.stringify(place));
    else localStorage.removeItem("ccb-origin");
    setLocationOpen(false);
    setLocationError("");
  };

  const clearOrigin = () => {
    setOrigin(null);
    localStorage.removeItem("ccb-origin");
  };

  const retryRoutes = () => setRoadState((current) => ({ ...current, originKey: roadKey, failed: false }));

  const useCurrentLocation = async () => {
    setLocationError("");
    setLocating(true);
    try {
      const position = await getDevicePosition();
      if (position.accuracy > MAX_LOCATION_ACCURACY_METERS) {
        setLocationError(`A posição recebida está imprecisa (±${formatAccuracy(position.accuracy)}). Ative a localização precisa ou salve seu endereço.`);
        return;
      }
      selectOrigin({
        id: "current",
        name: "Localização atual",
        address: `Precisão aproximada de ${formatAccuracy(position.accuracy)}`,
        ...position,
      }, false);
    } catch (error) {
      setLocationError(LOCATION_FAILURE_MESSAGES[error instanceof LocationError ? error.reason : "unavailable"]);
    } finally {
      setLocating(false);
    }
  };

  const savePlace = async (event: FormEvent) => {
    event.preventDefault();
    setLocating(true);
    setLocationError("");
    try {
      const search = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        countrycodes: "br",
        q: placeAddress,
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${search}`);
      if (!response.ok) throw new Error();
      const [result] = await response.json();
      if (!result) throw new Error();
      const accuracy = geocodeUncertainty(result, placeAddress);
      if (accuracy === null) {
        const found = String(result.display_name ?? "").split(",").slice(0, 3).join(",");
        setLocationError(`O mapa devolveu outro lugar (${found}). Confira o número da quadra e o bairro, ou use a localização atual.`);
        return;
      }
      const place: SavedPlace = { id: crypto.randomUUID(), name: placeName.trim(), address: result.display_name || placeAddress.trim(), latitude: Number(result.lat), longitude: Number(result.lon), accuracy };
      const next = [...places, place];
      setPlaces(next);
      localStorage.setItem("ccb-places", JSON.stringify(next));
      setPlaceName(""); setPlaceAddress(""); selectOrigin(place);
    } catch { setLocationError("Endereço não encontrado. Tente incluir rua, bairro, cidade e estado."); }
    finally { setLocating(false); }
  };

  const removePlace = (id: string) => {
    const next = places.filter((place) => place.id !== id);
    setPlaces(next);
    localStorage.setItem("ccb-places", JSON.stringify(next));
    if (origin?.id === id) clearOrigin();
  };

  const changeView = (next: View) => {
    setView(next);
    setVisibleCount(PAGE_SIZE);
    window.scrollTo({ top: 0 });
  };

  const changeUf = (next: string) => { setUf(next); setCity(""); setVisibleCount(PAGE_SIZE); };

  const distanceOf = (item: { church: ChurchItem; distanceKm: number | null }) => {
    const road = roads.values[item.church.id];
    if (road !== undefined) return { km: road, mode: "road" as const };
    if (item.distanceKm !== null && roadStatus === "failed") return { km: item.distanceKm, mode: "straight" as const };
    return null;
  };
  const ordered = useMemo(() => {
    if (!origin) return results;
    const effective = (item: ResultItem) => roads.values[item.church.id] ?? (item.distanceKm !== null ? item.distanceKm * 1.25 : Infinity);
    return [...results].sort((a, b) => effective(a) - effective(b) || a.church.name.localeCompare(b.church.name, "pt-BR"));
  }, [results, roads.values, origin]);

  const distanceText = (item: ResultItem) => {
    const info = distanceOf(item);
    if (!info) return null;
    const approximate = info.mode === "straight" || !hasVerifiedPosition(item.church);
    return { text: `${approximate ? "≈ " : ""}${formatDistance(info.km)}`, mode: info.mode === "straight" ? "em linha reta" : "de carro" };
  };
  const dayName = DAYS.find((item) => item.short === day)?.long;
  const selectedItem = selectedChurch ? ordered.find(({ church }) => church.id === selectedChurch.id) ?? { church: selectedChurch, distanceKm: origin && hasCoordinates(selectedChurch) ? straightLineKm(origin, selectedChurch) : null, matching: [] } : null;
  const selectedDistance = selectedItem ? distanceText(selectedItem) : null;
  const cityOptions = meta && uf ? Object.entries(meta.states[uf]?.cities ?? {}).sort(([a], [b]) => a.localeCompare(b, "pt-BR")) : [];
  const loading = !today || searching;
  const needsRegion = view === "explore" && !origin && !uf;
  const hasMore = view === "explore" && search.items.length < search.total;

  const viewTabs = (className: string) => <nav className={className} aria-label="Seções">
    {VIEWS.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => changeView(id)}>
      <Icon size={18} fill={view === id && id === "favorites" ? "currentColor" : "none"} /><span>{label}</span>
    </button>)}
  </nav>;

  return <main className="app-shell">
    {splashVisible && <div className="app-splash" role="status" aria-live="polite">
      <span className="app-splash-mark"><Image src="/favicons/icon.svg" alt="" width={88} height={88} priority unoptimized /></span>
      <p className="app-splash-title">Casas de Oração</p>
      <p className="app-splash-subtitle">Encontre um lugar para congregar</p>
      <span className="app-splash-loader" aria-hidden="true"><i /><i /><i /></span>
    </div>}
    <header className="topbar">
      <a className="brand" href="#top">
        <span className="brand-mark"><Image src="/favicons/icon.svg" alt="" width={34} height={34} priority unoptimized /></span>
        <b>{SITE.shortName}</b>
      </a>
      {viewTabs("nav-links")}
      {installable && <button className="app-link" onClick={openInstall}><Download size={16} /><span>Instalar app</span></button>}
    </header>

    <section className="hero" id="top">
      <h1>Onde congregar?</h1>
      <p>Casas de oração de todo o Brasil, conforme o relatório oficial.</p>

      <div className="finder-card">
        <button className={origin ? "origin-picker selected" : "origin-picker attention"} onClick={() => setLocationOpen(true)}>
          <span className="origin-icon"><MapPin size={18} /></span>
          <span className="origin-text"><small>Saindo de</small><b>{origin?.name || "Usar minha localização"}</b>{origin ? <i>{origin.address}</i> : <i>As casas mais próximas, em todo o Brasil</i>}</span>
          <ChevronDown size={18} />
        </button>

        {!origin && <div className="region-row">
          <label><span><Globe2 size={14} /> Ou escolha o estado</span>
            <select value={uf} onChange={(event) => changeUf(event.target.value)} aria-label="Estado">
              <option value="">Estado…</option>
              {STATES.map((state) => <option key={state.uf} value={state.uf}>{state.name}{meta?.states[state.uf] ? ` (${meta.states[state.uf].count})` : ""}</option>)}
            </select>
          </label>
          <label><span>Cidade</span>
            <select value={city} onChange={(event) => { setCity(event.target.value); setVisibleCount(PAGE_SIZE); }} disabled={!uf} aria-label="Cidade">
              <option value="">Todas as cidades</option>
              {cityOptions.map(([name, count]) => <option key={name} value={name}>{name} ({count})</option>)}
            </select>
          </label>
        </div>}
        {origin && <button className="clear-origin" onClick={clearOrigin}><X size={14} /> Procurar por estado em vez da localização</button>}

        <div className="filter-row">
          <div className="day-chips" role="group" aria-label="Dia da semana">
            {DAYS.map((item) => <button key={item.short} className={today && day === item.short ? "active" : ""} aria-pressed={day === item.short} onClick={() => { setDay(item.short); setVisibleCount(PAGE_SIZE); }} title={item.long}>
              <span>{item.short}</span>
              {item.short === today && <i>Hoje</i>}
            </button>)}
          </div>
          <div className="period-chips" role="group" aria-label="Período">
            {PERIODS.map((item) => <button key={item} className={period === item ? "active" : ""} aria-pressed={period === item} onClick={() => { setPeriod(item); setVisibleCount(PAGE_SIZE); }}>{item}</button>)}
          </div>
          <div className="search-field"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Buscar por nome, bairro ou endereço" aria-label="Buscar casa de oração" enterKeyHint="search" />{query && <button onClick={() => setQuery("")} aria-label="Limpar busca"><X size={16} /></button>}</div>
        </div>
      </div>
    </section>

    <section className="results-section" aria-busy={loading}>
      <div className="results-toolbar">
        <div>
          <h2>{loading ? "Carregando…" : needsRegion ? "Escolha onde procurar" : `${view === "explore" ? search.total - (search.items.length - results.length) : results.length} ${results.length === 1 && view !== "explore" ? "casa com culto" : "casas com culto"}`}</h2>
          <p>{dayName} · {period === "Todos" ? "todos os períodos" : period.toLocaleLowerCase("pt-BR")}{origin ? (roadStatus === "loading" ? " · calculando rotas" : roadStatus === "road" ? " · mais próximas primeiro, de carro" : "") : uf ? ` · ${STATES.find((state) => state.uf === uf)?.name}${city ? `, ${city}` : ""}` : ""}</p>
        </div>
        {view === "archived" && archived.items.size > 0 && <button className="restore-all" onClick={archived.clear}><ArchiveRestore size={16} /> Desarquivar todas</button>}
      </div>

      {origin?.accuracy !== undefined && origin.accuracy > APPROXIMATE_ORIGIN_METERS && <div className="notice" role="status">
        <TriangleAlert size={18} />
        <p><b>Ponto de saída aproximado (±{formatAccuracy(origin.accuracy)}).</b> As distâncias podem variar até esse valor. Para um cálculo exato, use a localização atual ou salve o endereço com rua, número e cidade.</p>
        <button onClick={() => setLocationOpen(true)}><Crosshair size={15} /> Mudar</button>
      </div>}

      {origin && view === "explore" && (search.items[0]?.distanceKm ?? 0) > 100 && <div className="notice" role="status">
        <TriangleAlert size={18} />
        <p><b>A casa mais próxima fica a mais de {Math.floor((search.items[0]?.distanceKm ?? 0) / 50) * 50} km.</b> Confira se o ponto de saída está certo ou procure por estado e cidade.</p>
        <button onClick={() => setLocationOpen(true)}><Crosshair size={15} /> Mudar</button>
      </div>}

      {origin && roadStatus === "failed" && <div className="notice" role="status">
        <TriangleAlert size={18} />
        <p><b>Rotas indisponíveis no momento.</b> As distâncias abaixo são estimativas em linha reta; o trajeto de carro costuma ser maior.</p>
        <button onClick={retryRoutes}><RefreshCw size={15} /> Tentar de novo</button>
      </div>}

      {view === "explore" && search.status === "error" && <div className="notice" role="alert">
        <TriangleAlert size={18} />
        <p><b>Não foi possível buscar as casas agora.</b> Verifique a conexão e tente novamente.</p>
        <button onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Tentar de novo</button>
      </div>}

      {view === "explore" && search.others.length > 0 && <section className="nearby-other" aria-label="Perto de você, em outros dias">
        <h3><MapPin size={16} /> Perto de você, em outros dias</h3>
        <p>Estas casas ficam mais perto, mas não têm culto neste filtro ({dayName}{period === "Todos" ? "" : ` · ${period.toLocaleLowerCase("pt-BR")}`}). Toque em um dia para ver.</p>
        <ul>
          {search.others.map(({ church, distanceKm, days }) => {
            const road = roads.values[church.id];
            return <li key={church.id}>
              <div><b>{church.name}</b><small>{church.city} · {church.state} · ≈ {formatDistance(road ?? distanceKm)} {road !== undefined ? "de carro" : "em linha reta"}</small></div>
              <div className="nearby-days">
                {days.map((short) => <button key={short} title={DAYS.find((item) => item.short === short)?.long} onClick={() => { setDay(short); setVisibleCount(PAGE_SIZE); window.scrollTo({ top: 0 }); }}>{short}</button>)}
              </div>
            </li>;
          })}
        </ul>
      </section>}

      {loading ? <div className="church-grid" aria-hidden="true">{[0, 1, 2].map((item) => <div className="church-card skeleton" key={item} />)}</div>
        : needsRegion ? <div className="empty-state"><Globe2 size={30} /><h3>De onde você está?</h3><p>Use a sua localização para ver as casas de oração mais próximas, em qualquer lugar do Brasil, ou escolha o estado e a cidade acima.</p><button onClick={() => setLocationOpen(true)}>Usar minha localização</button></div>
        : ordered.length ? <>
          <div className="church-grid">
            {ordered.slice(0, view === "explore" ? ordered.length : visibleCount).map((item) => {
              const { church, matching } = item;
              const distance = distanceText(item);
              return <article className="church-card" key={church.id} tabIndex={0} onClick={() => setSelectedChurch(church)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedChurch(church); } }}>
                <div className="card-top">
                  {distance
                    ? <div className="distance-badge"><Navigation size={14} fill="currentColor" /><b>{distance.text}</b><span>{distance.mode}</span></div>
                    : !origin
                      ? <button className="distance-badge action" onClick={(event) => { event.stopPropagation(); setLocationOpen(true); }}><MapPin size={14} /> Ver distância</button>
                      : <div className="distance-badge muted">{hasCoordinates(church) && roadStatus !== "failed" ? <><LoaderCircle size={14} className="spin" /> Calculando</> : "Distância indisponível"}</div>}
                  <div className="card-tools" onClick={(event) => event.stopPropagation()}>
                    <button className={favorites.items.has(church.id) ? "favorited" : ""} onClick={() => favorites.update(church.id)} aria-label={favorites.items.has(church.id) ? "Remover dos favoritos" : "Favoritar"} aria-pressed={favorites.items.has(church.id)}><Star size={20} fill={favorites.items.has(church.id) ? "currentColor" : "none"} /></button>
                    <button onClick={() => archived.update(church.id)} aria-label={archived.items.has(church.id) ? "Desarquivar" : "Arquivar"}>{archived.items.has(church.id) ? <ArchiveRestore size={20} /> : <Archive size={20} />}</button>
                  </div>
                </div>
                <div className="card-heading"><h3>{church.name}</h3><p>{church.city} · {church.state}</p></div>
                <div className="address"><MapPinned size={17} /><span>{church.address}</span></div>
                <div className="service-list">
                  {matching.map((service: Service, serviceIndex: number) => <div className="service-row" key={`${service.type}-${service.time}-${serviceIndex}`}>
                    <span className={service.type.includes("jovens") ? "service-icon youth" : "service-icon"}>{service.type.includes("jovens") ? <Heart size={17} /> : <Church size={17} />}</span>
                    <div><small>{service.type}</small><b>{service.time}</b></div>
                    <span className="period-tag">{periodFor(service.time)}</span>
                  </div>)}
                </div>
                <RouteActions church={church} origin={origin} />
                <span className="card-more">Ver detalhes <ChevronRight size={15} /></span>
              </article>;
            })}
          </div>
          {view === "explore"
            ? hasMore && <button className="load-more" onClick={loadMore}>Mostrar mais {Math.min(FETCH_SIZE, search.total - search.items.length)} de {search.total - search.items.length}</button>
            : visibleCount < ordered.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Mostrar mais {Math.min(PAGE_SIZE, ordered.length - visibleCount)} de {ordered.length - visibleCount}</button>}
        </> : <div className="empty-state"><Church size={30} /><h3>{EMPTY_STATES[view].title}</h3><p>{EMPTY_STATES[view].text}</p><button onClick={() => { setView("explore"); setPeriod("Todos"); setQuery(""); }}>Limpar filtros</button></div>}

      {view === "explore" && search.unlocatedNearby.length > 0 && <section className="nearby-other unlocated" aria-label="Casas na região sem posição confirmada">
        <h3><TriangleAlert size={16} /> Na região, sem posição confirmada</h3>
        <p>Estas casas têm culto neste filtro, mas o mapa não confirma onde ficam, então não há distância nem rota. Confira o endereço oficial.</p>
        <ul>
          {search.unlocatedNearby.map(({ church }) => <li key={church.id}>
            <div><b>{church.name}</b><small>{church.city} · {church.state} · {church.address}</small></div>
            <button className="detail-link" onClick={() => setSelectedChurch(church)}>Detalhes</button>
          </li>)}
        </ul>
      </section>}
    </section>

    <DonationInvite />

    <footer>
      <p className="footer-independence">{SITE.independence}</p>
      {meta && <span>{meta.total.toLocaleString("pt-BR")} casas conferidas no relatório oficial em {formatDate(meta.updatedAt)}</span>}
      <a href={SITE.officialReportUrl} target="_blank" rel="noreferrer">Consultar relatório oficial</a>
      {installable && <button className="footer-link" onClick={openInstall}>Instalar app</button>}
      <Link href="/apoiar">Apoiar o desenvolvedor</Link>
      <Link href="/termos">Termos de uso</Link>
      <Link href="/privacidade">Privacidade</Link>
    </footer>

    {viewTabs("tabbar")}

    <AppPrompt />

    {locationOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationOpen(false); }}>
      <section className="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-title">
        <div className="modal-head"><div><h2 id="location-title">De onde você vai sair?</h2><p>As casas mais próximas e as distâncias são calculadas a partir deste ponto.</p></div><button onClick={() => setLocationOpen(false)} aria-label="Fechar"><X /></button></div>
        <button className="current-location-card" onClick={useCurrentLocation} disabled={locating}><Crosshair size={20} /><span><b>Usar localização atual</b><small>GPS do aparelho, lido na hora</small></span>{locating ? <LoaderCircle className="spin" /> : origin?.id === "current" ? <Check size={18} /> : <ChevronRight size={18} />}</button>
        {locationError && <p className="form-error" role="alert"><Info size={16} /> {locationError}</p>}
        {places.length > 0 && <div className="saved-places"><label>Endereços salvos</label>{places.map((place) => <div className={origin?.id === place.id ? "saved-place active" : "saved-place"} key={place.id}><button onClick={() => selectOrigin(place)}><MapPinned size={18} /><span><b>{place.name}</b><small>{place.address}</small></span>{origin?.id === place.id && <Check size={17} />}</button><button onClick={() => removePlace(place.id)} aria-label={`Excluir ${place.name}`}><Trash2 size={17} /></button></div>)}</div>}
        <div className="divider"><span>Salvar um endereço</span></div>
        <form onSubmit={savePlace} className="place-form"><label>Nome<input value={placeName} onChange={(event) => setPlaceName(event.target.value)} placeholder="Casa" required maxLength={40} /></label><label>Endereço<input value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} placeholder="Rua, número, bairro, cidade e estado" required /></label><button type="submit" disabled={locating}><Plus size={17} /> Salvar e usar</button></form>
        <p className="privacy-note"><ShieldCheck size={14} /> Salvo somente neste aparelho.</p>
      </section>
    </div>}

    {selectedChurch && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedChurch(null); }}>
      <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="church-details-title">
        <div className="modal-head details-head">
          <div><span className="official-code">{selectedChurch.id}</span><h2 id="church-details-title">{selectedChurch.name}</h2><p>{selectedChurch.city} · {selectedChurch.state}{selectedDistance && ` · ${selectedDistance.text} ${selectedDistance.mode}`}</p></div>
          <button onClick={() => setSelectedChurch(null)} aria-label="Fechar detalhes"><X /></button>
        </div>

        <div className="detail-address"><MapPinned size={18} /><span><b>Endereço oficial</b>{selectedChurch.address}</span></div>
        <p className={hasVerifiedPosition(selectedChurch) ? "position-note verified" : "position-note"}>
          {hasVerifiedPosition(selectedChurch) ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}
          {POSITION_NOTES[selectedChurch.coordinateStatus] ?? POSITION_NOTES.unavailable}
        </p>
        <RouteActions church={selectedChurch} origin={origin} className="detail-routes" />
        <a className="report-error" href={reportErrorUrl(selectedChurch, SITE.contactEmail)}><Flag size={14} /> Endereço ou posição errados? Avise</a>

        <div className="detail-section">
          <h3><Church size={17} /> Dias de culto</h3>
          <div className="detail-services">{selectedChurch.services.map((service: Service, index: number) => <div key={`${service.day}-${service.time}-${index}`}><span>{DAYS.find((item) => item.short === service.day)?.long ?? service.day}</span><b>{service.time}</b><small>{service.type}</small></div>)}</div>
        </div>

        <div className="detail-section">
          <h3><Users size={17} /> Ministério</h3>
          {selectedChurch.ministry.length ? <div className="ministry-list">{selectedChurch.ministry.map((group) => <div key={group.role}><b>{group.role}</b>{group.names.map((name) => <span key={name}>{name}</span>)}</div>)}</div> : <p className="not-informed">Não informado no relatório oficial.</p>}
        </div>

        <div className="detail-section">
          <h3><Phone size={17} /> Telefone(s)</h3>
          {selectedChurch.phones.length ? <div className="phone-list">{selectedChurch.phones.map((phone) => <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} key={phone}><Phone size={14} /> {phone}</a>)}</div> : <p className="not-informed">Não informado no relatório oficial.</p>}
        </div>

        <a className="official-source" href={SITE.officialReportUrl} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> Agenda conferida no relatório oficial em {formatDate(selectedChurch.officialVerification)}</a>
      </section>
    </div>}
  </main>;
}
