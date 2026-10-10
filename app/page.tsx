"use client";

import Image from "next/image";
import Link from "next/link";
import AppPrompt from "../components/AppPrompt";
import { isInstalled, openInstall } from "../lib/install";
import { SITE } from "../lib/site";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Church,
  Crosshair,
  Download,
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
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import churchData from "../data/churches.json";
import {
  type ChurchItem,
  type Service,
  churches,
  googleMapsRouteUrl,
  hasVerifiedPosition,
  routeDestinations,
  wazeRouteUrl,
} from "../lib/churches";
import { formatAccuracy, formatDistance, geocodeUncertainty, straightLineKm } from "../lib/geo";
import { LOCATION_FAILURE_MESSAGES, LocationError, getDevicePosition } from "../lib/location";

type SavedPlace = { id: string; name: string; address: string; latitude: number; longitude: number; accuracy?: number };
type Period = "Todos" | "Manhã" | "Tarde" | "Noite";
type View = "explore" | "favorites" | "archived";
// "road": trajeto de carro; "estimated": linha reta, usada quando o serviço de rotas falha.
type Distances = { status: "idle" | "loading" | "road" | "estimated"; values: Record<string, number> };

const MAX_LOCATION_ACCURACY_METERS = 500;
// Acima disso o ponto de saída é tratado como aproximado e a tela avisa.
const APPROXIMATE_ORIGIN_METERS = 250;
const PAGE_SIZE = 12;
const PERIODS: Period[] = ["Todos", "Manhã", "Tarde", "Noite"];

const DAYS = [
  { short: "Dom", long: "Domingo" }, { short: "Seg", long: "Segunda" },
  { short: "Ter", long: "Terça" }, { short: "Qua", long: "Quarta" },
  { short: "Qui", long: "Quinta" }, { short: "Sex", long: "Sexta" },
  { short: "Sáb", long: "Sábado" },
];

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

const localDateKey = () => new Date().toLocaleDateString("sv-SE");

const periodFor = (time: string): Exclude<Period, "Todos"> => {
  const hour = Number(time.split(":")[0]);
  return hour < 12 ? "Manhã" : hour < 18 ? "Tarde" : "Noite";
};

const normalizeSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

const searchIndex = new Map(churches.map((church) => [
  church.id,
  normalizeSearch(`${church.name} ${church.neighborhood} ${church.city} ${church.address}`),
]));

const POSITION_NOTES: Record<string, string> = {
  verified: "Posição confirmada no mapa. A rota abre direto no ponto da casa de oração.",
  approximate: "Posição aproximada pelo endereço. A rota abre pela busca do endereço oficial — confira o destino antes de sair.",
  unavailable: "Sem posição confirmada no mapa. A rota abre pela busca do endereço oficial — confira o destino antes de sair.",
};

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

function RouteActions({ church, origin, className = "" }: { church: ChurchItem; origin: SavedPlace | null; className?: string }) {
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
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedChurch, setSelectedChurch] = useState<ChurchItem | null>(null);
  const [distances, setDistances] = useState<Distances>({ status: "idle", values: {} });
  const [routeAttempt, setRouteAttempt] = useState(0);
  const favorites = useStoredSet("ccb-favorites");
  const archived = useStoredSet("ccb-archived");
  const modalOpen = locationOpen || selectedChurch !== null;
  const closeModalRef = useRef<() => boolean>(() => false);

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
          if (savedOrigin.id === "current") {
            localStorage.removeItem("ccb-origin");
          } else {
            setDistances({ status: "loading", values: {} });
            setOrigin(savedOrigin);
          }
        }
        const filters = JSON.parse(localStorage.getItem("ccb-filters") || "null");
        // O dia só é restaurado na mesma data; em um novo dia a busca volta para "hoje".
        if (filters?.day && filters.savedOn === localDateKey()) setDay(filters.day);
        if (PERIODS.includes(filters?.period)) setPeriod(filters.period);
      } catch { /* ignora preferências locais inválidas */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (today) localStorage.setItem("ccb-filters", JSON.stringify({ day, period, savedOn: localDateKey() }));
  }, [today, day, period]);

  useEffect(() => {
    if (!origin) return;

    const controller = new AbortController();
    fetch("/api/distances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { latitude: origin.latitude, longitude: origin.longitude },
        destinations: routeDestinations,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao calcular rotas");
        return response.json() as Promise<{ distances: Record<string, number> }>;
      })
      .then(({ distances: values }) => setDistances({ status: "road", values }))
      .catch(() => {
        if (controller.signal.aborted) return;
        setDistances({
          status: "estimated",
          values: Object.fromEntries(routeDestinations.map((destination) => [destination.id, straightLineKm(origin, destination)])),
        });
      });

    return () => controller.abort();
  }, [origin, routeAttempt]);

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
    setDistances({ status: "loading", values: {} });
    setOrigin(place);
    if (persist) localStorage.setItem("ccb-origin", JSON.stringify(place));
    else localStorage.removeItem("ccb-origin");
    setLocationOpen(false);
    setLocationError("");
  };

  const retryRoutes = () => {
    setDistances({ status: "loading", values: {} });
    setRouteAttempt((attempt) => attempt + 1);
  };

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
        bounded: "1",
        viewbox: "-49.1,-15.2,-47.1,-16.5",
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
    } catch { setLocationError("Endereço não encontrado. Tente incluir quadra, bairro e cidade."); }
    finally { setLocating(false); }
  };

  const removePlace = (id: string) => {
    const next = places.filter((place) => place.id !== id);
    setPlaces(next);
    localStorage.setItem("ccb-places", JSON.stringify(next));
    if (origin?.id === id) {
      setOrigin(null);
      setDistances({ status: "idle", values: {} });
      localStorage.removeItem("ccb-origin");
    }
  };

  const changeView = (next: View) => {
    setView(next);
    setVisibleCount(PAGE_SIZE);
    window.scrollTo({ top: 0 });
  };

  const results = useMemo(() => {
    const searchTerms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    return churches
      .map((church) => ({
        church,
        matching: church.services.filter((service) => service.day === day && (period === "Todos" || periodFor(service.time) === period)),
        distance: distances.values[church.id] ?? null,
      }))
      .filter(({ church, matching }) => {
        const words = searchIndex.get(church.id) ?? "";
        const inView = view === "favorites" ? favorites.items.has(church.id) : view === "archived" ? archived.items.has(church.id) : !archived.items.has(church.id);
        return matching.length && inView && searchTerms.every((term) => words.includes(term));
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.church.name.localeCompare(b.church.name, "pt-BR"));
  }, [day, period, query, view, favorites.items, archived.items, distances.values]);

  // Casas mais perto do que os primeiros resultados, mas sem culto no dia/período escolhido.
  const nearbyElsewhere = useMemo(() => {
    const ready = distances.status === "road" || distances.status === "estimated";
    if (!origin || !ready || view !== "explore" || query.trim()) return [];
    const shown = new Set(results.map(({ church }) => church.id));
    const limit = results[2]?.distance ?? Infinity;
    return churches
      .filter((church) => !shown.has(church.id) && !archived.items.has(church.id) && (distances.values[church.id] ?? Infinity) < limit)
      .map((church) => ({
        church,
        distance: distances.values[church.id],
        days: DAYS.filter((item) => church.services.some((service) => service.day === item.short && (period === "Todos" || periodFor(service.time) === period))),
      }))
      .filter(({ days }) => days.length > 0)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [origin, distances, view, query, period, results, archived.items]);

  const distanceText = (church: ChurchItem, distance: number | null) => {
    if (distance === null) return null;
    const approximate = distances.status === "estimated" || !hasVerifiedPosition(church);
    return `${approximate ? "≈ " : ""}${formatDistance(distance)}`;
  };
  const distanceMode = distances.status === "estimated" ? "em linha reta" : "de carro";
  const dayName = DAYS.find((item) => item.short === day)?.long;
  const selectedDistance = selectedChurch ? distanceText(selectedChurch, distances.values[selectedChurch.id] ?? null) : null;

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
      <p>Brasília, Distrito Federal e Águas Lindas de Goiás.</p>

      <div className="finder-card">
        <button className={origin ? "origin-picker selected" : "origin-picker attention"} onClick={() => setLocationOpen(true)}>
          <span className="origin-icon"><MapPin size={18} /></span>
          <span className="origin-text"><small>Saindo de</small><b>{origin?.name || "Escolha sua localização"}</b>{origin && <i>{origin.address}</i>}</span>
          <ChevronDown size={18} />
        </button>

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

    <section className="results-section" aria-busy={!today}>
      <div className="results-toolbar">
        <div>
          <h2>{today ? `${results.length} ${results.length === 1 ? "casa com culto" : "casas com culto"}` : "Carregando…"}</h2>
          <p>{dayName} · {period === "Todos" ? "todos os períodos" : period.toLocaleLowerCase("pt-BR")}{distances.status === "loading" ? " · calculando rotas" : distances.status === "road" ? " · mais próximas primeiro, de carro" : ""}</p>
        </div>
        {view === "archived" && archived.items.size > 0 && <button className="restore-all" onClick={archived.clear}><ArchiveRestore size={16} /> Desarquivar todas</button>}
      </div>

      {origin?.accuracy !== undefined && origin.accuracy > APPROXIMATE_ORIGIN_METERS && <div className="notice" role="status">
        <TriangleAlert size={18} />
        <p><b>Ponto de saída aproximado (±{formatAccuracy(origin.accuracy)}).</b> As distâncias podem variar até esse valor. Para um cálculo exato, use a localização atual ou salve o endereço com quadra e conjunto.</p>
        <button onClick={() => setLocationOpen(true)}><Crosshair size={15} /> Mudar</button>
      </div>}

      {distances.status === "estimated" && <div className="notice" role="status">
        <TriangleAlert size={18} />
        <p><b>Rotas indisponíveis no momento.</b> As distâncias abaixo são estimativas em linha reta; o trajeto de carro costuma ser maior.</p>
        <button onClick={retryRoutes}><RefreshCw size={15} /> Tentar de novo</button>
      </div>}

      {nearbyElsewhere.length > 0 && <section className="nearby-other" aria-label="Perto de você, em outros dias">
        <h3><MapPin size={16} /> Perto de você, em outros dias</h3>
        <p>Estas casas ficam mais perto, mas não têm culto neste filtro ({dayName}{period === "Todos" ? "" : ` · ${period.toLocaleLowerCase("pt-BR")}`}). Toque em um dia para ver.</p>
        <ul>
          {nearbyElsewhere.map(({ church, distance, days }) => <li key={church.id}>
            <div><b>{church.name}</b><small>{church.city} · {distanceText(church, distance)} {distanceMode}</small></div>
            <div className="nearby-days">
              {days.map((item) => <button key={item.short} title={item.long} onClick={() => { setDay(item.short); setVisibleCount(PAGE_SIZE); window.scrollTo({ top: 0 }); }}>{item.short}</button>)}
            </div>
          </li>)}
        </ul>
      </section>}

      {!today ? <div className="church-grid" aria-hidden="true">{[0, 1, 2].map((item) => <div className="church-card skeleton" key={item} />)}</div> : results.length ? <>
        <div className="church-grid">
          {results.slice(0, visibleCount).map(({ church, matching, distance }) => <article className="church-card" key={church.id} tabIndex={0} onClick={() => setSelectedChurch(church)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedChurch(church); } }}>
            <div className="card-top">
              {distance !== null
                ? <div className="distance-badge"><Navigation size={14} fill="currentColor" /><b>{distanceText(church, distance)}</b><span>{distanceMode}</span></div>
                : !origin
                  ? <button className="distance-badge action" onClick={(event) => { event.stopPropagation(); setLocationOpen(true); }}><MapPin size={14} /> Ver distância</button>
                  : <div className="distance-badge muted">{distances.status === "loading" ? <><LoaderCircle size={14} className="spin" /> Calculando</> : "Distância indisponível"}</div>}
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
          </article>)}
        </div>
        {visibleCount < results.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Mostrar mais {Math.min(PAGE_SIZE, results.length - visibleCount)} de {results.length - visibleCount}</button>}
      </> : <div className="empty-state"><Church size={30} /><h3>{EMPTY_STATES[view].title}</h3><p>{EMPTY_STATES[view].text}</p><button onClick={() => { setView("explore"); setPeriod("Todos"); setQuery(""); }}>Limpar filtros</button></div>}
    </section>

    <footer>
      <p className="footer-independence">{SITE.independence}</p>
      <span>{churchData.officialTotal} casas conferidas em {churchData.updatedAt.split("-").reverse().join("/")}</span>
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
        <div className="modal-head"><div><h2 id="location-title">De onde você vai sair?</h2><p>As distâncias são calculadas a partir deste ponto.</p></div><button onClick={() => setLocationOpen(false)} aria-label="Fechar"><X /></button></div>
        <button className="current-location-card" onClick={useCurrentLocation} disabled={locating}><Crosshair size={20} /><span><b>Usar localização atual</b><small>GPS do aparelho, lido na hora</small></span>{locating ? <LoaderCircle className="spin" /> : origin?.id === "current" ? <Check size={18} /> : <ChevronRight size={18} />}</button>
        {locationError && <p className="form-error" role="alert"><Info size={16} /> {locationError}</p>}
        {places.length > 0 && <div className="saved-places"><label>Endereços salvos</label>{places.map((place) => <div className={origin?.id === place.id ? "saved-place active" : "saved-place"} key={place.id}><button onClick={() => selectOrigin(place)}><MapPinned size={18} /><span><b>{place.name}</b><small>{place.address}</small></span>{origin?.id === place.id && <Check size={17} />}</button><button onClick={() => removePlace(place.id)} aria-label={`Excluir ${place.name}`}><Trash2 size={17} /></button></div>)}</div>}
        <div className="divider"><span>Salvar um endereço</span></div>
        <form onSubmit={savePlace} className="place-form"><label>Nome<input value={placeName} onChange={(event) => setPlaceName(event.target.value)} placeholder="Casa" required maxLength={40} /></label><label>Endereço<input value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} placeholder="Quadra ou rua, bairro e cidade" required /></label><button type="submit" disabled={locating}><Plus size={17} /> Salvar e usar</button></form>
        <p className="privacy-note"><ShieldCheck size={14} /> Salvo somente neste aparelho.</p>
      </section>
    </div>}

    {selectedChurch && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedChurch(null); }}>
      <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="church-details-title">
        <div className="modal-head details-head">
          <div><span className="official-code">{selectedChurch.id}</span><h2 id="church-details-title">{selectedChurch.name}</h2><p>{selectedChurch.city} · {selectedChurch.state}{selectedDistance && ` · ${selectedDistance} ${distanceMode}`}</p></div>
          <button onClick={() => setSelectedChurch(null)} aria-label="Fechar detalhes"><X /></button>
        </div>

        <div className="detail-address"><MapPinned size={18} /><span><b>Endereço oficial</b>{selectedChurch.address}</span></div>
        <p className={hasVerifiedPosition(selectedChurch) ? "position-note verified" : "position-note"}>
          {hasVerifiedPosition(selectedChurch) ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}
          {POSITION_NOTES[selectedChurch.coordinateStatus] ?? POSITION_NOTES.unavailable}
        </p>
        <RouteActions church={selectedChurch} origin={origin} className="detail-routes" />

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

        <a className="official-source" href={selectedChurch.sourceUrl} target="_blank" rel="noreferrer"><ShieldCheck size={14} /> Agenda conferida no relatório oficial em {selectedChurch.officialVerification.split("-").reverse().join("/")}</a>
      </section>
    </div>}
  </main>;
}
