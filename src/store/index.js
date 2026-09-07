'use strict';

const memory = { snapshots: [], predictions: [], bets: [] };
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const connected = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let client = null;

if (connected) {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const CONTINENTAL_COMPETITIONS = new Set([
  'uefa_champions_league','uefa_champions_league_qualifying',
  'uefa_europa_league','uefa_europa_league_qualifying',
  'uefa_conference_league','uefa_conference_league_qualifying',
  'concacaf_champions_cup','leagues_cup',
  'copa_libertadores','copa_sudamericana'
]);

const CALENDAR_YEAR_LEAGUES = new Set([
  'mls','argentina_primera','brazil_serie_a','colombia_primera_a','ecuador_liga_pro','paraguay_primera',
  'concacaf_champions_cup','leagues_cup','copa_libertadores','copa_sudamericana',
  'uefa_belarus','uefa_estonia','uefa_faroe_islands','uefa_finland','uefa_georgia','uefa_iceland',
  'uefa_ireland','uefa_latvia','uefa_lithuania','uefa_norway','uefa_sweden'
]);

const EXTRA_ALIASES = {
  'Real Betis (ESP)': ['Real Betis Balompié','Real Betis'],
  'Real Betis': ['Real Betis Balompié'],
  'Club Atlético de Madrid (ESP)': ['Club Atlético de Madrid','Atlético de Madrid','Atletico Madrid'],
  'Atlético Madrid': ['Club Atlético de Madrid','Atlético de Madrid'],
  'FC Internazionale Milano (ITA)': ['FC Internazionale Milano','Inter Milan','Inter'],
  'Inter Milan': ['FC Internazionale Milano','Inter'],
  'Real Madrid CF (ESP)': ['Real Madrid CF','Real Madrid'],
  'Liverpool FC (ENG)': ['Liverpool FC','Liverpool'],
  'Manchester City FC (ENG)': ['Manchester City FC','Manchester City'],
  'Arsenal FC (ENG)': ['Arsenal FC','Arsenal'],
  'FC Porto (POR)': ['FC Porto','Porto'],
  'Lille OSC (FRA)': ['Lille OSC','Lille'],
  'SSC Napoli (ITA)': ['SSC Napoli','Napoli'],
  'Fenerbahçe (TUR)': ['Fenerbahçe'],
  'RB Leipzig (GER)': ['RB Leipzig','Leipzig'],
  'Slavia Praha (CZE)': ['Slavia Praha','SK Slavia Praha','Slavia Praga'],
  'SK Slavia Praha (CZE)': ['Slavia Praha','SK Slavia Praha','Slavia Praga'],
  'Racing Club de Lens (FRA)': ['Racing Club de Lens','RC Lens','Lens'],
  'RC Lens (FRA)': ['Racing Club de Lens','RC Lens','Lens'],
  'América': ['CF América','Club América','America'],
  'CF América': ['América','Club América'],
  'Tigres UANL': ['UANL Tigres','Tigres'],
  'UANL Tigres': ['Tigres UANL','Tigres'],
  'Guadalajara': ['Deportivo Guadalajara','Chivas Guadalajara'],
  'Deportivo Guadalajara': ['Guadalajara','Chivas Guadalajara'],
  'Toluca': ['Deportivo Toluca'],
  'Deportivo Toluca': ['Toluca'],
  'Pachuca': ['CF Pachuca'],
  'CF Pachuca': ['Pachuca'],
  'Monterrey': ['CF Monterrey'],
  'CF Monterrey': ['Monterrey'],
  'Querétaro': ['Gallos Blancos','Queretaro'],
  'Gallos Blancos': ['Querétaro','Queretaro'],
  'León': ['Club León'],
  'Club León': ['León'],
  'NY Red Bulls': ['New York Red Bulls'],
  'New York Red Bulls': ['NY Red Bulls'],
  'New York City': ['New York City FC'],
  'New York City FC': ['New York City'],
  'Los Angeles Galaxy': ['LA Galaxy'],
  'LA Galaxy': ['Los Angeles Galaxy'],
  'Inter Miami': ['Inter Miami CF'],
  'Inter Miami CF': ['Inter Miami']
};

function aliasesFor(team) {
  const original = String(team || '').trim();
  const stripped = original
    .replace(/\s+\([A-Z]{2,4}\)\s*$/i, '')
    .replace(/\s+\d+-\d+\s+pen\.?\s*$/i, '')
    .trim();
  const noClubSuffix = stripped.replace(/\s+(FC|CF|SC|AFC)$/i, '').trim();
  return [...new Set([
    original, stripped, noClubSuffix,
    ...(EXTRA_ALIASES[original] || []), ...(EXTRA_ALIASES[stripped] || []), ...(EXTRA_ALIASES[noClubSuffix] || [])
  ].filter(Boolean))];
}

async function pagedMatches({ league = null, select = '*', limit = 10000, cutoff = null } = {}) {
  if (!client) throw new Error('Supabase no está conectado');
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < limit; from += pageSize) {
    let q = client.from('fq_matches').select(select).eq('finished', true);
    if (league) q = q.eq('league_key', league);
    if (cutoff) q = q.lt('kickoff', cutoff);
    q = q.order('kickoff', { ascending: false });
    const { data, error } = await q.range(from, Math.min(from + pageSize - 1, limit - 1));
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function insert(table, row) {
  if (!client) {
    const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    memory[table] = memory[table] || [];
    memory[table].push(item);
    return item;
  }
  const payload = { app_key:'futbol_quant', category:table, payload:row, observed_at:row.observed_at || new Date().toISOString() };
  const { data, error } = await client.from('app_history').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function list(table, limit = 100) {
  if (!client) return (memory[table] || []).slice(-limit).reverse();
  let q = client.from('app_history').select('*').eq('app_key','futbol_quant').order('created_at',{ascending:false}).limit(Math.min(Number(limit||100),500));
  if (table) q = q.eq('category',table);
  const { data, error } = await q;
  if (error) throw error;
  return (data||[]).map(r=>({id:r.id,created_at:r.created_at,observed_at:r.observed_at,category:r.category,...(r.payload||{})}));
}

async function dataSummary() {
  if (!client) return [];
  const { data, error } = await client.from('fq_match_summary').select('league_key,competition,matches,finished,from_date,to_date').order('competition',{ascending:true});
  if (error) throw error;
  return (data||[]).map(r=>({league_key:r.league_key,competition:r.competition,matches:Number(r.matches||0),finished:Number(r.finished||0),from:r.from_date,to:r.to_date}));
}

async function teams(league) {
  const rows = await pagedMatches({ league, select:'home_team,away_team,kickoff', limit:10000 });
  const set = new Set();
  for (const r of rows) { if (r.home_team) set.add(r.home_team); if (r.away_team) set.add(r.away_team); }
  return [...set].sort((a,b)=>a.localeCompare(b,'es'));
}

function avg(xs){ return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function shrink(v,n,b,prior=6){ return (v*n+b*prior)/(n+prior); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function expectedSeason(league,date=new Date()){
  const y=date.getUTCFullYear();
  if(CALENDAR_YEAR_LEAGUES.has(league)) return String(y);
  const m=date.getUTCMonth()+1;
  return m>=7 ? `${y}-${String(y+1).slice(-2)}` : `${y-1}-${String(y).slice(-2)}`;
}
function perspectiveRates(rows,aliases){
  const vals=rows.map(r=>{const h=aliases.includes(r.home_team);return{gf:Number(h?r.home_score:r.away_score),ga:Number(h?r.away_score:r.home_score)};});
  return {n:vals.length,gf:avg(vals.map(x=>x.gf)),ga:avg(vals.map(x=>x.ga))};
}
function indexFrom(r,b,prior=5){const base=Math.max(Number(b||1.3),.35);return{attack:shrink(r.gf,r.n,base,prior)/base,defense:shrink(r.ga,r.n,base,prior)/base};}
function blend(parts){const v=parts.filter(p=>p&&p.weight>0);const t=v.reduce((s,p)=>s+p.weight,0)||1;return{attack:v.reduce((s,p)=>s+p.attack*p.weight,0)/t,defense:v.reduce((s,p)=>s+p.defense*p.weight,0)/t};}

async function teamRows(aliases,{league=null,season=null,cutoff=null,limit=40}={}){
  const select='kickoff,league_key,competition,season,home_team,away_team,home_score,away_score';
  const one=async col=>{
    let q=client.from('fq_matches').select(select).eq('finished',true).in(col,aliases).not('home_score','is',null).not('away_score','is',null);
    if(league)q=q.eq('league_key',league);if(season)q=q.eq('season',season);if(cutoff)q=q.lt('kickoff',cutoff);
    const {data,error}=await q.order('kickoff',{ascending:false}).limit(limit);if(error)throw error;return data||[];
  };
  const [h,a]=await Promise.all([one('home_team'),one('away_team')]);
  const map=new Map();for(const r of [...h,...a])map.set(`${r.kickoff}|${r.home_team}|${r.away_team}`,r);
  return [...map.values()].sort((x,y)=>String(y.kickoff).localeCompare(String(x.kickoff))).slice(0,limit);
}

async function inferDomesticContext(team,competitionLeague,cutoff){
  const aliases=aliasesFor(team);
  const rows=await teamRows(aliases,{cutoff,limit:180});
  const domestic=rows.filter(r=>!CONTINENTAL_COMPETITIONS.has(r.league_key)&&r.league_key!==competitionLeague);
  const counts=new Map();for(const r of domestic)counts.set(r.league_key,(counts.get(r.league_key)||0)+1);
  const domesticLeague=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  return {aliases,domesticLeague,rows:domestic.filter(r=>!domesticLeague||r.league_key===domesticLeague)};
}

async function predictionInput(league,home,away,opts={}){
  if(!client)throw new Error('Supabase no está conectado');
  const cutoff=opts.cutoff||new Date().toISOString();
  const cutoffDate=new Date(cutoff);
  const rows=await pagedMatches({league,select:'kickoff,league_key,competition,season,home_team,away_team,home_score,away_score',limit:10000,cutoff});
  const clean=rows.filter(r=>r.home_score!=null&&r.away_score!=null);
  if(clean.length<30)throw new Error('Todavía no hay suficiente historial para esta competición');
  const hAliases=aliasesFor(home),aAliases=aliasesFor(away);
  const baseRows=clean.slice(0,Math.min(clean.length,700));
  const baseHome=avg(baseRows.map(r=>Number(r.home_score))),baseAway=avg(baseRows.map(r=>Number(r.away_score))),baseTeam=avg(baseRows.flatMap(r=>[Number(r.home_score),Number(r.away_score)]));
  const competition=clean[0]?.competition||league;
  const season=expectedSeason(league,cutoffDate);

  if(!CONTINENTAL_COMPETITIONS.has(league)){
    const hRecent=clean.filter(r=>hAliases.includes(r.home_team)).slice(0,20),aRecent=clean.filter(r=>aAliases.includes(r.away_team)).slice(0,20);
    if(hRecent.length<3||aRecent.length<3)throw new Error('Muestra reciente insuficiente para uno de los equipos');
    const hCurrent=clean.filter(r=>r.season===season&&hAliases.includes(r.home_team)).slice(0,8),aCurrent=clean.filter(r=>r.season===season&&aAliases.includes(r.away_team)).slice(0,8);
    const hr=perspectiveRates(hRecent,hAliases),ar=perspectiveRates(aRecent,aAliases),hc=perspectiveRates(hCurrent,hAliases),ac=perspectiveRates(aCurrent,aAliases);
    const hRecentIdx={attack:shrink(hr.gf,hr.n,baseHome,6)/Math.max(baseHome,.35),defense:shrink(hr.ga,hr.n,baseAway,6)/Math.max(baseAway,.35)};
    const aRecentIdx={attack:shrink(ar.gf,ar.n,baseAway,6)/Math.max(baseAway,.35),defense:shrink(ar.ga,ar.n,baseHome,6)/Math.max(baseHome,.35)};
    const hw=hc.n?Math.min(.65,.35+hc.n*.075):0,aw=ac.n?Math.min(.65,.35+ac.n*.075):0;
    const hs=blend([{...indexFrom(hc,baseTeam,4),weight:hw},{...hRecentIdx,weight:1-hw}]);
    const as=blend([{...indexFrom(ac,baseTeam,4),weight:aw},{...aRecentIdx,weight:1-aw}]);
    return {league,home,away,homeXg:clamp(baseHome*hs.attack*as.defense,.25,3.8),awayXg:clamp(baseAway*as.attack*hs.defense,.20,3.8),sample:{league:baseRows.length,home:hRecent.length,away:aRecent.length,homeCurrentSeason:hc.n,awayCurrentSeason:ac.n},baselines:{leagueHomeGoals:baseHome,leagueAwayGoals:baseAway},teamRates:{homeFor:hr.gf,homeAgainst:hr.ga,awayFor:ar.gf,awayAgainst:ar.ga},context:{competition,currentSeason:season,competitionAware:true,currentSeasonWeighted:true,cutoff},methodology:`Modelo de ${competition}: temporada actual ${season} + rendimiento reciente local/visitante, usando solo partidos anteriores al corte.`};
  }

  const [hd,ad]=await Promise.all([inferDomesticContext(home,league,cutoff),inferDomesticContext(away,league,cutoff)]);
  const htRows=clean.filter(r=>hAliases.includes(r.home_team)||hAliases.includes(r.away_team)).slice(0,12),atRows=clean.filter(r=>aAliases.includes(r.home_team)||aAliases.includes(r.away_team)).slice(0,12);
  const ht=perspectiveRates(htRows,hAliases),at=perspectiveRates(atRows,aAliases);
  const hSeason=hd.domesticLeague?expectedSeason(hd.domesticLeague,cutoffDate):null,aSeason=ad.domesticLeague?expectedSeason(ad.domesticLeague,cutoffDate):null;
  const hcRows=hd.rows.filter(r=>r.season===hSeason).slice(0,8),acRows=ad.rows.filter(r=>r.season===aSeason).slice(0,8);
  const hUse=hcRows.length?hcRows:hd.rows.slice(0,8),aUse=acRows.length?acRows:ad.rows.slice(0,8);
  const hc=perspectiveRates(hUse,hd.aliases),ac=perspectiveRates(aUse,ad.aliases);
  const hDomBase=hd.rows.length?avg(hd.rows.slice(0,100).flatMap(r=>[Number(r.home_score),Number(r.away_score)])):baseTeam;
  const aDomBase=ad.rows.length?avg(ad.rows.slice(0,100).flatMap(r=>[Number(r.home_score),Number(r.away_score)])):baseTeam;
  const hTournament=indexFrom(ht,baseTeam,6),aTournament=indexFrom(at,baseTeam,6),hCurrent=indexFrom(hc,hDomBase,4),aCurrent=indexFrom(ac,aDomBase,4);
  const hTw=ht.n>=3?.32:ht.n? .15:0,aTw=at.n>=3?.32:at.n?.15:0;
  const hCw=hc.n?Math.min(.60,.32+hc.n*.055):0,aCw=ac.n?Math.min(.60,.32+ac.n*.055):0;
  const hNeutral={attack:1,defense:1},aNeutral={attack:1,defense:1};
  const hs=blend([{...hTournament,weight:hTw},{...hCurrent,weight:hCw},{...hNeutral,weight:Math.max(.15,1-hTw-hCw)}]);
  const as=blend([{...aTournament,weight:aTw},{...aCurrent,weight:aCw},{...aNeutral,weight:Math.max(.15,1-aTw-aCw)}]);
  return {league,home,away,homeXg:clamp(baseHome*hs.attack*as.defense,.25,3.8),awayXg:clamp(baseAway*as.attack*hs.defense,.20,3.8),sample:{league:baseRows.length,home:ht.n,away:at.n,homeCurrentSeason:hcRows.length,awayCurrentSeason:acRows.length},baselines:{leagueHomeGoals:baseHome,leagueAwayGoals:baseAway},teamRates:{homeFor:hc.gf,homeAgainst:hc.ga,awayFor:ac.gf,awayAgainst:ac.ga},context:{competition,currentSeason:season,competitionAware:true,currentSeasonWeighted:true,cutoff,homeDomesticLeague:hd.domesticLeague,awayDomesticLeague:ad.domesticLeague,homeDomesticSeason:hSeason,awayDomesticSeason:aSeason,homeTournamentMatches:ht.n,awayTournamentMatches:at.n},methodology:`Modelo internacional de ${competition}: historial del torneo + temporada vigente de la liga doméstica de cada club + forma reciente; solo usa partidos anteriores al corte.`};
}

async function bootstrap(){const summary=await dataSummary();return{ok:true,total_rows:summary.reduce((s,r)=>s+Number(r.finished||0),0),competitions:summary.length,note:'La base histórica está precargada en Supabase.'};}

async function savePredictionAudit(row){if(!client)return null;const{data,error}=await client.from('fq_prediction_audit').insert(row).select().single();if(error)throw error;return data;}
async function listPredictionAudit(limit=100){if(!client)return[];const{data,error}=await client.from('fq_prediction_audit').select('*').order('created_at',{ascending:false}).limit(Math.min(Number(limit||100),500));if(error)throw error;return data||[];}
async function settlePredictionAudit(id,homeGoals,awayGoals){
  if(!client)throw new Error('Supabase no está conectado');const hg=Number(homeGoals),ag=Number(awayGoals),actual=hg>ag?'L':hg===ag?'E':'V';
  const{data:cur,error:re}=await client.from('fq_prediction_audit').select('predicted_outcome').eq('id',id).single();if(re)throw re;
  const{data,error}=await client.from('fq_prediction_audit').update({home_goals:hg,away_goals:ag,actual_outcome:actual,correct:cur.predicted_outcome===actual,status:'final',settled_at:new Date().toISOString()}).eq('id',id).select().single();if(error)throw error;return data;
}
function status(){return{persistent:connected,backend:connected?'supabase-direct':'memory'};}

module.exports={insert,list,dataSummary,teams,predictionInput,bootstrap,savePredictionAudit,listPredictionAudit,settlePredictionAudit,status};
