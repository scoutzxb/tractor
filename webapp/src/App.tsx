import { useEffect, useMemo, useRef, useState } from 'react'
import { t, Language } from './i18n'

type Card = { id:number; suit?:'spade'|'heart'|'club'|'diamond'; rank?:string; joker?:'small'|'big' }
type Seat = 'east' | 'north' | 'west' | 'south'
type PlayerMode = 'single' | 'two' | 'four'
type State = any

const suit = (s?:string) => s==='spade'?'♠':s==='heart'?'♥':s==='club'?'♣':'♦'
const txt = (c:Card) => c.joker==='big'?'JOKER':c.joker==='small'?'joker':`${suit(c.suit)}${c.rank}`
const cls = (c:Card) => c.joker==='big'?'pcard p-jbig':c.joker==='small'?'pcard p-jsmall':(c.suit==='heart'||c.suit==='diamond')?'pcard p-red':'pcard p-black'

const suitOrderDesc:Record<string,number>={spade:4,heart:3,club:2,diamond:1}
const rankOrderDesc:Record<string,number>={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14}
const FOLLOW_SUIT_PRIORITY = ['trump','spade','heart','club','diamond','']
const ALL_SEATS: Seat[] = ['east','north','west','south']

const getPlaySuit = (card: Card, level: string, trumpSuit: string | null): string => {
  if (card.joker) return 'trump'
  if (card.rank === level) return 'trump'
  return card.suit || ''
}

const getCardValueForSort = (card: Card, level: string, trumpSuit: string | null): number => {
  if (card.joker === 'big') return 1000
  if (card.joker === 'small') return 900
  if (card.rank === level) return 800 + (card.suit === trumpSuit ? 100 : 0)
  const rankValue = rankOrderDesc[card.rank || ''] || 0
  return rankValue + (card.suit === trumpSuit ? 100 : 0)
}

const sortCardsByValue = (cards: Card[], level: string, trumpSuit: string | null): Card[] =>
  [...cards].sort((a, b) => getCardValueForSort(b, level, trumpSuit) - getCardValueForSort(a, level, trumpSuit))

function sortHand(cards:Card[], level:string, trumpSuit?:string|null){
  const bucket=(c:Card)=>{
    if(c.joker==='big') return 0
    if(c.joker==='small') return 1
    if(!c.joker&&c.rank===level) return 2
    if(trumpSuit && !c.joker && c.suit===trumpSuit) return 3
    return 4
  }
  const levelPower=(c:Card)=>800+((trumpSuit&&c.suit===trumpSuit)?100:0)+(c.suit? suitOrderDesc[c.suit]||0:0)
  return [...cards].sort((a,b)=>{
    const ba=bucket(a), bb=bucket(b)
    if(ba!==bb) return ba-bb
    if(ba<=1) return 0
    if(ba===2) return levelPower(b)-levelPower(a)
    if(ba===3){
      const ra=a.rank? rankOrderDesc[a.rank]||0:0
      const rb=b.rank? rankOrderDesc[b.rank]||0:0
      return rb-ra
    }
    const sa=a.suit? suitOrderDesc[a.suit]||0:0
    const sb=b.suit? suitOrderDesc[b.suit]||0:0
    if(sa!==sb) return sb-sa
    const ra=a.rank? rankOrderDesc[a.rank]||0:0
    const rb=b.rank? rankOrderDesc[b.rank]||0:0
    return rb-ra
  })
}

const sortPlayedCards = (cards: Card[], leadCards: Card[] | null, isLeader: boolean, level: string, trumpSuit: string | null): Card[] => {
  const sorted = [...cards]
  if (isLeader) return sortCardsByValue(sorted, level, trumpSuit)
  const leadSuit = leadCards && leadCards.length ? getPlaySuit(leadCards[0], level, trumpSuit) : null
  return sorted.sort((a, b) => {
    const suitA = getPlaySuit(a, level, trumpSuit)
    const suitB = getPlaySuit(b, level, trumpSuit)
    const valueA = getCardValueForSort(a, level, trumpSuit)
    const valueB = getCardValueForSort(b, level, trumpSuit)
    if (leadSuit) {
      const isLeadA = suitA === leadSuit
      const isLeadB = suitB === leadSuit
      if (isLeadA !== isLeadB) return isLeadB ? 1 : -1
      if (isLeadA && isLeadB) return valueB - valueA
    }
    const priorityA = FOLLOW_SUIT_PRIORITY.indexOf(suitA)
    const priorityB = FOLLOW_SUIT_PRIORITY.indexOf(suitB)
    if (priorityA !== priorityB) return priorityA - priorityB
    if (suitA !== suitB) {
      const orderA = priorityA === -1 ? FOLLOW_SUIT_PRIORITY.length : priorityA
      const orderB = priorityB === -1 ? FOLLOW_SUIT_PRIORITY.length : priorityB
      return orderA - orderB
    }
    return valueB - valueA
  })
}

async function post(path:string,body:any){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json()}

export function App(){
  const [view, setView] = useState<'lobby' | 'game'>('lobby')
  const [playerName, setPlayerName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [playerSeat, setPlayerSeat] = useState<Seat>('south')
  const [createSeat, setCreateSeat] = useState<Seat>('south')
  const [joinSeat, setJoinSeat] = useState<Seat>('north')
  const [playerToken, setPlayerToken] = useState('')
  const [joinSessionId, setJoinSessionId] = useState('')
  const [hostSeat, setHostSeat] = useState<Seat>('south')

  const [lang, setLang] = useState<Language>('zh')
  const [state, setState] = useState<State|null>(null)
  const [mode, setMode] = useState('grab')
  const [playerMode, setPlayerMode] = useState<PlayerMode>('single')
  const [level, setLevel] = useState('2')
  const [dealer, setDealer] = useState('south')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<string[]>([])
  const [showReview, setShowReview] = useState(false)
  const [showKitty, setShowKitty] = useState(false)
  const [showSaves, setShowSaves] = useState(false)
  const [savedGames, setSavedGames] = useState<any[]>([])
  const [autosaves, setAutosaves] = useState<any[]>([])
  const [autosaveLoading, setAutosaveLoading] = useState(false)
  const [showAutosavePanel, setShowAutosavePanel] = useState(false)
  const [postDealRemaining, setPostDealRemaining] = useState<number>(0)
  const [countdown, setCountdown] = useState(5)
  const timerRef = useRef<number|undefined>(undefined)
  const hasTakenKitty = useRef<boolean>(false)

  const add = (s:string) => setLogs(x => [s, ...x].slice(0, 40))
  const currentMode: PlayerMode = (state?.playerMode || playerMode) as PlayerMode
  const requiredSeats: Seat[] = currentMode === 'four' ? ALL_SEATS : currentMode === 'two' ? ['north','south'] : ['south']
  const seatChoicesForCreate: Seat[] = playerMode === 'four' ? ALL_SEATS : playerMode === 'two' ? ['north','south'] : ['south']
  const isHost = playerSeat === hostSeat

  const saveGame = async (saveName?: string) => {
    if (!sessionId) return
    const d = await post('/api/save-game', { sessionId, saveName })
    add(d.ok ? (d.message || t(lang, 'gameSaved')) : (d.error || t(lang, 'saveFailed')))
  }

  const loadGame = async (filename: string) => {
    const d = await post('/api/load-game', { filename, desiredSeat: playerSeat, playerToken })
    if (!d.ok) return add(d.error || t(lang, 'loadFailed'))
    setSessionId(d.sessionId)
    setPlayerToken(d.playerToken)
    setPlayerSeat(d.playerSeat)
    setState(d.state)
    setView('game')
    setShowSaves(false)
    add(d.message || t(lang, 'gameLoaded'))
  }

  const listSaves = async () => {
    const d = await post('/api/list-saves', {})
    if (d.saves) { setSavedGames(d.saves); setShowSaves(true) } else add(d.error || t(lang, 'loadFailed'))
  }

  const listAutosaves = async () => {
    if (!playerName.trim()) return alert(t(lang, 'enterNameAlert'))
    setAutosaveLoading(true)
    const d = await post('/api/autosave-list', { playerName: playerName.trim() })
    setAutosaveLoading(false)
    if (d.ok) { setAutosaves(d.saves || []); setShowAutosavePanel(true) } else add(d.error || t(lang, 'loadFailed'))
  }

  const resumeAutosave = async (previewMode: PlayerMode) => {
    if (!playerName.trim()) return alert(t(lang, 'enterNameAlert'))
    const d = await post('/api/autosave-load', { playerName: playerName.trim(), playerMode: previewMode })
    if (!d.ok) return add(d.error || t(lang, 'loadFailed'))
    setSessionId(d.sessionId)
    setPlayerToken(d.playerToken)
    setPlayerSeat(d.playerSeat)
    setState(d.state)
    setPlayerMode(d.playerMode || previewMode)
    setHostSeat(d.playerSeat)
    if (d.state?.mode) setMode(d.state.mode)
    if (d.state?.level) setLevel(d.state.level)
    if (d.state?.dealer) setDealer(d.state.dealer)
    setView('game')
    add(d.message || t(lang, 'gameLoaded'))
  }

  const deleteSave = async (filename: string) => {
    if (!confirm(t(lang, 'confirmDelete'))) return
    const d = await post('/api/delete-save', { filename })
    if (d.ok) { setSavedGames(savedGames.filter(s => s.filename !== filename)); add(d.message || t(lang, 'saveDeleted')) }
    else add(d.error || t(lang, 'deleteFailed'))
  }

  const createGame = async () => {
    if (!playerName.trim()) return alert(t(lang, 'enterNameAlert'))
    const d = await post('/api/new-game', { mode, level, dealer, playerMode })
    if (d.error) return add(d.error)
    const joinResp = await post('/api/join-game', { sessionId: d.sessionId, desiredSeat: createSeat, playerName: playerName.trim() })
    if (joinResp.error) return add(joinResp.error)
    setSessionId(d.sessionId)
    setPlayerToken(joinResp.playerToken)
    setPlayerSeat(createSeat)
    setHostSeat(createSeat)
    setState(joinResp.state)
    setView('game')
    setLogs([playerMode === 'single' ? `${t(lang,'singleMode')} - ${t(lang, createSeat)}` : `${t(lang,'gameFlowStep1')} (ID: ${d.sessionId})`])
  }

  const joinGame = async () => {
    if (!playerName.trim()) return alert(t(lang, 'enterNameAlert'))
    if (!joinSessionId.trim()) return alert(t(lang, 'enterGameIdAlert'))
    const d = await post('/api/join-game', { sessionId: joinSessionId.trim(), desiredSeat: joinSeat, playerName: playerName.trim() })
    if (d.error) { alert(d.error); return add(d.error) }
    setSessionId(joinSessionId.trim())
    setPlayerToken(d.playerToken)
    setPlayerSeat(d.playerSeat)
    if (d.playerMode) setPlayerMode(d.playerMode)
    setState(d.state)
    setView('game')
    setLogs([`${t(lang, d.playerMode === 'four' ? 'fourMode' : d.playerMode === 'two' ? 'twoMode' : 'singleMode')} - ${t(lang, d.playerSeat as any)}`])
  }

  const tick = async () => {
    if (!sessionId) return
    const d = await post('/api/tick', { sessionId, playerSeat })
    if (d.alreadyAdvanced && d.state) {
      setState(d.state)
      return
    }
    if (d.error) {
      if (d.error === 'dealing already done') {
        const stateResp = await post('/api/state', { sessionId, playerSeat })
        if (!stateResp.error) {
          setState(stateResp)
          add(stateResp.phase === 'postDeal' ? t(lang, 'dealingDoneNotify') : t(lang, 'dealingDoneShort'))
        }
      } else add(d.error)
      return
    }
    d.declarations?.forEach((x: any) => add(`${t(lang, 'declareOptions')} ${x.seat}: ${x.cards}`))
    setState(d.state)
    setSelected(new Set())
  }

  const postDealTick = async () => {
    if (!sessionId) return
    const d = await post('/api/post-deal-tick', { sessionId, playerSeat })
    if (d.error) return add(d.error)
    setPostDealRemaining(d.remainingMs > 0 ? d.remainingMs : 0)
    setState(d.state)
  }

  const declare = async (key: string) => {
    const d = await post('/api/declare', { sessionId, key, playerSeat })
    if (d.error) return add(d.error)
    add(`${t(lang, 'declareOptions')}: ${d.label}`)
    setState(d.state)
    setSelected(new Set())
  }

  const takeKitty = async () => {
    const d = await post('/api/take-kitty', { sessionId, playerSeat })
    if (d.error) {
      add(`Take kitty error: ${d.error}`)
      // Reset the ref so user can retry if there was a sync issue
      if (d.error.includes('not kitty holder') || d.error.includes('not set')) {
        hasTakenKitty.current = false
        add('You can try again or refresh the page if the issue persists.')
      }
      return
    }
    setSelected(new Set())
    ;(d.logs || []).forEach((x: string) => add(`Chaodi: ${x}`))
    setState(d.state)
  }

  const discard = async () => {
    if (selected.size !== 6) return add(t(lang, 'select6Cards', { count: selected.size }))
    const d = await post('/api/discard', { sessionId, cardIds: [...selected], playerSeat })
    if (d.error) return add(d.error)
    setSelected(new Set())
    ;(d.logs || []).forEach((x: string) => add(`Chaodi: ${x}`))
    setState(d.state)
  }

  const passChaodi = async () => {
    const d = await post('/api/chao-di-pass-generic', { sessionId, playerSeat })
    if (d.error) return add(d.error)
    ;(d.logs || []).forEach((x: string) => add(`Chaodi: ${x}`))
    setState(d.state)
    setSelected(new Set())
  }

  const doChaodi = async (key: string) => {
    const d = await post('/api/chao-di', { sessionId, key, playerSeat })
    if (d.error) return add(d.error)
    add(`Chaodi: ${d.label}`)
    setState(d.state)
    setSelected(new Set())
  }

  const playHuman = async () => {
    if (!state) return
    const inHand = new Set((state.myHand || []).map((c: Card) => String(c.id)))
    const safe = [...selected].filter(id => inHand.has(id))
    if (safe.length === 0) return add(t(lang, 'playError'))
    if (state.phase === 'play' && state.currentTurn === playerSeat && leadCount > 0 && safe.length !== requiredCount) {
      return add(t(lang, 'cardsRequired', { required: requiredCount, count: safe.length }))
    }
    const d = await post('/api/play', { sessionId, cardIds: safe, playerSeat })
    if (d.error) return add(d.error)
    setSelected(new Set())
    ;(d.events || []).forEach((x: string) => add(`System: ${x}`))
    if (d.winner) add(`${t(lang, 'winner')}: ${d.winner}, ${t(lang, 'score')}: ${d.points}`)
    setState(d.state)
  }

  const getAISuggestion = async () => {
    if (!state) return
    const d = await post('/api/ai-suggestion', { sessionId, playerSeat })
    if (d.error) return add(d.error)
    if (d.suggestedCardIds?.length) {
      setSelected(new Set(d.suggestedCardIds.map(String)))
      add(`AI: ${d.suggestedCards}`)
    }
  }

  const nextGame = async () => {
    if (!sessionId) return
    const nextMode = state?.gameResult?.nextMode ?? mode
    const nextLevel = state?.gameResult?.nextLevel ?? level
    const nextDealer = state?.gameResult?.nextDealer ?? dealer
    const d = await post('/api/next-game', { sessionId, mode: nextMode, level: nextLevel, dealer: nextDealer, playerMode: currentMode, playerSeat })
    if (d.error) return add(d.error)
    setSessionId(d.sessionId)
    setState(d)
    setSelected(new Set())
    setMode(d.mode ?? nextMode)
    setLevel(d.level ?? nextLevel)
    setDealer(d.dealer ?? nextDealer)
    hasTakenKitty.current = false
  }

  useEffect(() => {
    if (state?.phase === 'dealing') timerRef.current = window.setInterval(() => { tick() }, 500)
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [state?.phase, sessionId])

  useEffect(() => {
    if (!state || state.phase !== 'postDeal' || !sessionId) return
    const pollInterval = window.setInterval(() => { postDealTick() }, 500)
    return () => window.clearInterval(pollInterval)
  }, [state?.phase, sessionId])

  useEffect(() => {
    if (currentMode === 'single' || !sessionId || !state || state.phase !== 'waiting') return
    const pollInterval = window.setInterval(async () => {
      const d = await post('/api/state', { sessionId, playerSeat })
      if (d.error) return
      setState(d)
      const joined = d.connectedPlayers || []
      const missing = requiredSeats.filter(seat => !joined.includes(seat))
      if (missing.length === 0 && isHost) {
        add(t(lang, 'allPlayersJoined'))
        window.clearInterval(pollInterval)
        const startResp = await post('/api/start-game', { sessionId, playerSeat })
        if (startResp.error) add(startResp.error)
        else { setState(startResp.state); add(t(lang, 'gameStarted')) }
      }
    }, 2000)
    return () => window.clearInterval(pollInterval)
  }, [currentMode, sessionId, state?.phase, playerSeat, hostSeat, lang])

  useEffect(() => {
    if (currentMode === 'single' || !sessionId || !state || state.phase !== 'play') return
    if (state.currentTurn === playerSeat || state.waitingNextRound) return
    const pollInterval = window.setInterval(async () => {
      const d = await post('/api/state', { sessionId, playerSeat })
      if (d.error) return
      setState(d)
    }, 1000)
    return () => window.clearInterval(pollInterval)
  }, [currentMode, sessionId, state?.phase, state?.currentTurn, state?.waitingNextRound, playerSeat])

  useEffect(() => {
    if (currentMode !== 'single' || !sessionId || !state) return

    const runSinglePlayerAutopilot = async () => {
      if (state.phase === 'postDeal') {
        await postDealTick()
        return
      }

      if (state.phase === 'chaodi') {
        if ((state.chaoDiOptions || []).length > 0) return
        const d = await post('/api/run-chaodi', { sessionId, playerSeat })
        if (d?.error) {
          add(d.error)
          return
        }
        if (d?.logs) d.logs.forEach((x: string) => add(`Chaodi: ${x}`))
        if (d?.state) setState(d.state)
        return
      }

      if (state.phase === 'play') {
        if (state.waitingNextRound) {
          const d = await post('/api/next-round', { sessionId, playerSeat })
          if (d?.events) d.events.forEach((x: string) => add(`System: ${x}`))
          if (d?.state) setState(d.state)
          return
        }
        if (state.currentTurn === playerSeat) return
        const d = await post('/api/advance-play', { sessionId, playerSeat })
        if (d?.events) d.events.forEach((x: string) => add(`System: ${x}`))
        if (d?.state) setState(d.state)
      }
    }

    const timer = window.setTimeout(runSinglePlayerAutopilot, 250)
    return () => window.clearTimeout(timer)
  }, [currentMode, sessionId, state?.phase, state?.currentTurn, state?.waitingNextRound, state?.chaoDiOptions, playerSeat])

  useEffect(() => {
    if (!sessionId || !state || state.phase !== 'kitty' || !state.kittyHolder || state.kittyHolder !== playerSeat || !state.kittyCards?.length) return
    if (!hasTakenKitty.current) {
      hasTakenKitty.current = true
      takeKitty()
    }
  }, [state?.phase, state?.kittyHolder, state?.kittyCards, sessionId])

  useEffect(() => {
    if (!state?.myHand) return
    const inHand = new Set((state.myHand || []).map((c: Card) => String(c.id)))
    setSelected(prev => {
      const next = new Set([...prev].filter(id => inHand.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [state?.myHand, state?.phase])

  useEffect(() => { setAutosaves([]); setShowAutosavePanel(false) }, [playerName])

  useEffect(() => {
    if (state?.phase === 'done') {
      setCountdown(5)
      const interval = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(interval); nextGame(); return 0 }
          return c - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [state?.phase])

  const hand: Card[] = state?.myHand || []
  const sorted = useMemo(() => sortHand(hand, state?.level || level, state?.trump?.suit || null), [hand, state?.level, state?.trump?.suit, level])
  const table = useMemo(() => {
    const raw = state?.tablePlays || { south: [], east: [], north: [], west: [] }
    const currentLeader = state?.currentLeader
    const lv = state?.level || '2'
    const trumpSuit = state?.trump?.suit || null
    if (!currentLeader || !raw[currentLeader]?.length) return raw
    const leadCards = raw[currentLeader]
    const out: Record<string, Card[]> = {}
    for (const seat of ALL_SEATS) out[seat] = (raw[seat] || []).length ? sortPlayedCards(raw[seat], leadCards, seat === currentLeader, lv, trumpSuit) : []
    return out
  }, [state?.tablePlays, state?.currentLeader, state?.level, state?.trump?.suit])
  const leadCount = (table.east?.length || table.north?.length || table.west?.length || table.south?.length || 0)
  const requiredCount = state?.phase === 'play' && state?.currentTurn === playerSeat && leadCount > 0 ? leadCount : 1
  const isKittyDiscard = state?.phase === 'kitty'
  const dealerSeat = state?.dealer
  const partner: Record<string, string> = { east: 'west', west: 'east', north: 'south', south: 'north' }
  const dealerTeam = dealerSeat ? new Set([dealerSeat, partner[dealerSeat]]) : new Set<string>()
  const defenderSeats = ALL_SEATS.filter(s => !dealerTeam.has(s))
  const defenderTotal = state?.scores ? defenderSeats.reduce((sum, s) => sum + (state.scores[s] || 0), 0) : 0
  const defenderPointCards: Card[] = state?.defenderPointCards || []

  const manualSavePanel = showSaves ? (
    <div className="panel mb-4">
      <div className="flex justify-between items-center mb-2"><b>{t(lang, 'savesTitle')}</b><button onClick={() => setShowSaves(false)} className="text-sm">{t(lang, 'close')}</button></div>
      {savedGames.length === 0 ? <p className="text-gray-600">{t(lang, 'noSaves')}</p> : <div className="space-y-2">{savedGames.map((save: any) => <div key={save.filename} className="flex justify-between items-center p-2 bg-gray-100 rounded"><div><div className="font-medium">{save.filename}</div><div className="text-sm text-gray-600">{t(lang, 'phase')}: {t(lang, save.phase)} | {t(lang, 'level')}: {save.level} | {t(lang, 'dealer')}: {t(lang, save.dealer)}{save.savedAt && <span className="ml-2">{t(lang, 'savedAt')}: {new Date(save.savedAt).toLocaleString()}</span>}</div></div><div className="flex gap-2"><button onClick={() => loadGame(save.filename)} className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">{t(lang, 'load')}</button><button onClick={() => deleteSave(save.filename)} className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">{t(lang, 'delete')}</button></div></div>)}</div>}
    </div>
  ) : null

  if (view === 'lobby') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t(lang, 'title')}</h1>
          <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">{lang === 'zh' ? 'English' : '中文'}</button>
        </div>
        <div className="panel mb-4">
          <label className="block mb-2 font-bold">{t(lang, 'yourName')}</label>
          <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full p-2 border rounded" placeholder={t(lang, 'namePlaceholder')} />
        </div>
        <div className="panel mb-4">
          <h2 className="text-xl font-bold mb-2">{t(lang, 'createGame')}</h2>
          <div className="flex gap-2 mb-2 flex-wrap">
            <select value={playerMode} onChange={e => setPlayerMode(e.target.value as PlayerMode)} className="p-2 border rounded"><option value="single">{t(lang, 'singleMode')}</option><option value="two">{t(lang, 'twoMode')}</option><option value="four">{t(lang, 'fourMode')}</option></select>
            <select value={createSeat} onChange={e => setCreateSeat(e.target.value as Seat)} className="p-2 border rounded">{seatChoicesForCreate.map(x => <option key={x} value={x}>{t(lang, x)}</option>)}</select>
            <select value={mode} onChange={e => setMode(e.target.value)} className="p-2 border rounded"><option value="grab">{t(lang, 'grabMode')}</option><option value="normal">{t(lang, 'normalMode')}</option></select>
            <select value={level} onChange={e => setLevel(e.target.value)} className="p-2 border rounded">{['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(x => <option key={x}>{x}</option>)}</select>
            <select value={dealer} onChange={e => setDealer(e.target.value)} className="p-2 border rounded">{ALL_SEATS.map(x => <option key={x} value={x}>{t(lang, x)}</option>)}</select>
          </div>
          <button onClick={createGame} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{t(lang, 'createGameButton')}</button>
          {playerMode === 'two' && <p className="text-sm text-gray-600 mt-2">{t(lang, 'twoModeHint')}</p>}
          {playerMode === 'four' && <p className="text-sm text-gray-600 mt-2">{t(lang, 'fourModeHint')}</p>}
        </div>
        <div className="panel mb-4">
          <h2 className="text-xl font-bold mb-2">{t(lang, 'joinGame')}</h2>
          <div className="flex gap-2 mb-2">
            <input type="text" value={joinSessionId} onChange={e => setJoinSessionId(e.target.value)} className="w-full p-2 border rounded" placeholder={t(lang, 'gameIdPlaceholder')} />
            <select value={joinSeat} onChange={e => setJoinSeat(e.target.value as Seat)} className="p-2 border rounded">{ALL_SEATS.map(x => <option key={x} value={x}>{t(lang, x)}</option>)}</select>
          </div>
          <button onClick={joinGame} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">{t(lang, 'joinGameButton')}</button>
        </div>
        <div className="panel mb-4">
          <h2 className="text-xl font-bold mb-2">{t(lang, 'autosaveTitle')}</h2>
          <button onClick={listAutosaves} disabled={autosaveLoading || !playerName.trim()} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">{autosaveLoading ? t(lang, 'loading') : t(lang, 'autosaveButton')}</button>
          {showAutosavePanel && <div className="mt-3 space-y-2">{autosaves.length === 0 ? <p className="text-sm text-gray-500">{t(lang, 'autosaveNoSaves')}</p> : autosaves.map((save: any) => <div key={`${save.playerMode}-${save.playerSeat}`} className="px-3 py-2 bg-gray-900 border border-gray-800 rounded"><div className="text-sm text-gray-400">{t(lang, 'autosaveModeLabel')}: {t(lang, save.playerMode === 'single' ? 'singleMode' : save.playerMode === 'two' ? 'twoMode' : 'fourMode')}</div><div className="text-sm text-gray-400">{t(lang, 'autosavePhaseLabel')}: {t(lang, save.phase)}</div><div className="text-sm text-gray-400">{t(lang, 'autosaveSeatLabel')}: {t(lang, save.playerSeat)}</div><div className="text-sm text-gray-400">{t(lang, 'autosaveUpdated')}: {new Date(save.updatedAt).toLocaleString()}</div><button onClick={() => resumeAutosave(save.playerMode)} className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">{t(lang, 'resumeAutosaveButton')}</button></div>)}</div>}
        </div>
        <div className="panel mb-4"><h2 className="text-xl font-bold mb-2">{t(lang, 'savesTitle')}</h2><button onClick={listSaves} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{t(lang, 'viewManualSaves')}</button></div>
        {manualSavePanel}
        <div className="panel small text-gray-600"><p className="mb-2"><strong>{t(lang, 'gameFlow')}</strong></p><ol className="list-decimal list-inside"><li>{t(lang, 'gameFlowStep1')}</li><li>{t(lang, 'gameFlowStep2')}</li><li>{t(lang, 'gameFlowStep3')}</li><li>{t(lang, 'gameFlowStep4')}</li></ol></div>
      </div>
    )
  }

  return (
    <div>
      <div className="panel mb-2">
        <strong>{t(lang, 'youAre')} {t(lang, playerSeat as any)}</strong>
        <span className="ml-4 text-sm text-gray-600">{t(lang, 'gameId')}: {sessionId}</span>
        <button onClick={() => setView('lobby')} className="ml-4 px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">{t(lang, 'backToLobby')}</button>
        <button onClick={() => saveGame()} className="ml-2 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">{t(lang, 'saveGame')}</button>
        <button onClick={listSaves} className="ml-2 px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">{t(lang, 'loadSave')}</button>
        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="ml-2 px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">{lang === 'zh' ? 'English' : '中文'}</button>
      </div>
      {showKitty && state?.kittyHolder === playerSeat && <div className="panel"><b>{t(lang, 'kitty')}</b><div className="cards">{(state.kittyCards || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div></div>}
      <div className="panel"><select value={mode} onChange={e => setMode(e.target.value)} disabled><option value="grab">{t(lang, 'grabMode')}</option><option value="normal">{t(lang, 'normalMode')}</option></select><select value={level} onChange={e => setLevel(e.target.value)} disabled>{['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(x => <option key={x}>{x}</option>)}</select><select value={dealer} onChange={e => setDealer(e.target.value)} disabled>{ALL_SEATS.map(x => <option key={x} value={x}>{t(lang, x as any)}</option>)}</select><button onClick={() => setShowReview(v => !v)} disabled={!state?.lastRoundReview}>{t(lang, 'reviewLastRound')}</button><button onClick={() => setShowKitty(v => !v)} disabled={!state || state.kittyHolder !== playerSeat}>{showKitty ? t(lang, 'hideKitty') : t(lang, 'viewKitty')}</button></div>
      {state && <>
        <div className="panel small">{(() => { const trumpText = !state.trump ? t(lang, 'noSuit') : `${state.trump.cardsCount || 1}${state.trump.suit ? t(lang, state.trump.suit as any) : ''}/${t(lang, state.trump.declarer as any)}`; return <>{t(lang, 'phase')}: {t(lang, state.phase)} | {t(lang, 'mode')}: {t(lang, state.mode)} | {t(lang, 'trump')}: {trumpText} | {t(lang, 'currentTurn')}: {state.currentTurn ? t(lang, state.currentTurn) : '-'}</> })()}</div>
        <div className="panel"><b>{t(lang, 'score')}: {defenderTotal}</b><div className="cards">{defenderPointCards.map((c: Card, idx: number) => <span key={`${c.id}-${idx}`} className={cls(c)}>{txt(c)}</span>)}</div></div>
        {manualSavePanel}
        <div className="panel"><b>{t(lang, 'declareOptions')}</b><div className="matrix">{(state.declareOptions || []).map((o: any) => <button key={o.key} onClick={() => declare(o.key)}>{o.label}</button>)}</div></div>
        {state.phase === 'kitty' && state.kittyHolder === playerSeat && state.awaitingDiscard && <div className="panel"><b>{t(lang, 'select6Cards', { count: selected.size })}</b><button onClick={discard}>{t(lang, 'confirmDiscard')}</button></div>}
        {state.phase === 'chaodi' && <div className="panel">{(state.chaoDiOptions || []).length > 0 ? <><div className="matrix">{(state.chaoDiOptions || []).map((o: any) => <button key={o.key} onClick={() => doChaodi(o.key)}>{o.label}</button>)}</div><button onClick={passChaodi} style={{ marginTop: '8px', backgroundColor: '#6b7280' }}>{t(lang, 'abandonChaodi')}</button></> : <div className="small text-gray-600">{t(lang, 'waitingForChaodi')}</div>}</div>}
        {state.phase === 'postDeal' && <div className="panel"><b>{t(lang, 'dealingDone', { seconds: Math.ceil(postDealRemaining / 1000) })}</b><div className="small text-gray-600">{t(lang, 'canDeclareHint')}</div></div>}
        {state.phase === 'done' && state.gameResult && (
          <div className="panel" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', border: '2px solid #60a5fa', color: '#fff' }}>
            <h3 style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#60a5fa', marginBottom: '12px', textAlign: 'center' }}>🎉 {t(lang, 'gameSettleTitle')}</h3>
            <div style={{ marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#93c5fd' }}>📊 {t(lang, 'tableScore')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t(lang, 'dealerTeam')}: <b style={{color:'#fbbf24'}}>{state.gameResult.dealerTeamScore}</b> {t(lang, 'points')}</span>
                <span>{t(lang, 'defenderTeam')}: <b style={{color:'#fbbf24'}}>{state.gameResult.defenderTeamScore}</b> {t(lang, 'points')}</span>
              </div>
            </div>
            <div style={{ marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#93c5fd' }}>🎯 {t(lang, 'kittyDetail')}</div>
              <div>{t(lang, 'kittyBaseScore')}: <b style={{color:'#fbbf24'}}>{state.gameResult.kittyBaseScore}</b> {t(lang, 'points')}</div>
              <div>{t(lang, 'isKittyTaken')}: {state.gameResult.isKittyTaken ? `✅ ${t(lang, 'yesKittyTaken')}` : `❌ ${t(lang, 'noKittyTaken')}`}</div>
              {state.gameResult.isKittyTaken && (
                <>
                  <div>{t(lang, 'kittyMultiplier')}: <b style={{color:'#f472b6'}}>×{state.gameResult.kittyMultiplier}</b></div>
                  <div>{t(lang, 'kittyScore')}: <b style={{color:'#fbbf24'}}>{state.gameResult.kittyScore}</b> {t(lang, 'points')}</div>
                </>
              )}
            </div>
            <div style={{ marginBottom: '10px', padding: '12px', background: 'rgba(251,191,36,0.2)', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(251,191,36,0.5)' }}>
              <div style={{ fontWeight: 'bold', color: '#fbbf24' }}>{t(lang, 'finalScore')}: {t(lang, 'defenderTeam')} <b style={{fontSize:'1.2em'}}>{state.gameResult.totalScore}</b> {t(lang, 'points')}</div>
            </div>
            <div style={{ marginBottom: '10px', padding: '12px', background: state.gameResult.winner === 'dealer' ? 'rgba(34,197,94,0.2)' : 'rgba(244,114,182,0.2)', borderRadius: '6px', textAlign: 'center', border: state.gameResult.winner === 'dealer' ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(244,114,182,0.5)' }}>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: state.gameResult.winner === 'dealer' ? '#4ade80' : '#f472b6' }}>
                🏆 {state.gameResult.winner === 'dealer' ? t(lang, 'dealerWin') : t(lang, 'defenderWin')}
              </div>
            </div>
            <div style={{ padding: '10px', background: 'rgba(96,165,250,0.2)', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(96,165,250,0.5)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#93c5fd' }}>⏭️ {t(lang, 'nextGameSetting')}</div>
              <div style={{ color: '#cbd5e1' }}>{t(lang, 'nextDealer')}: <b style={{color:'#fbbf24'}}>{t(lang, state.gameResult.nextDealer as any)}</b> | {t(lang, 'nextLevel')}: <b style={{color:'#fbbf24'}}>{state.gameResult.nextLevel}</b> | {t(lang, 'nextMode')}: <b style={{color:'#fbbf24'}}>{t(lang, state.gameResult.nextMode)}</b></div>
              <div style={{ fontSize: '1em', color: '#60a5fa', marginTop: '8px', fontWeight: 'bold' }}>⏱️ {countdown}秒后进入下一局...</div>
            </div>
          </div>
        )}
        <div className="panel"><b>{t(lang, 'currentRound')}</b>{ALL_SEATS.map(seat => <div key={seat}><div className="small">{t(lang, seat as any)}</div><div className="cards">{(table[seat] || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div></div>)}</div>
        {showReview && state.lastRoundReview && <div className="panel"><b>{t(lang, 'lastRoundReview', { round: state.lastRoundReview.round })}</b><div className="small">{t(lang, 'winner')}: {state.lastRoundReview.winner} | {t(lang, 'score')}: {state.lastRoundReview.points}</div>{state.lastRoundReview.plays?.map((p: any) => <div key={p.seat}><span className="small">{t(lang, p.seat as any)}</span><span className="cards">{(p.cards || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</span></div>)}</div>}
        <div className="panel"><b>{t(lang, 'yourHand', { seat: t(lang, playerSeat as any) })}</b><div className="cards">{sorted.map(c => { const id = String(c.id); const on = selected.has(id); return <span key={id} onClick={() => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); if (isKittyDiscard && n.size > 6) n.delete(id); setSelected(n) }} className={`${cls(c)} ${on ? 'sel' : ''}`}>{txt(c)}</span> })}</div>{state.phase === 'play' && state.currentTurn === playerSeat && <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}><button onClick={playHuman} disabled={selected.size === 0 || (leadCount > 0 && selected.size !== requiredCount)} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>{t(lang, 'playSelected')}</button><button onClick={getAISuggestion} style={{ backgroundColor: '#8b5cf6', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>{t(lang, 'aiSuggestion')}</button></div>}</div>
        <div className="panel small">{logs.map((l, i) => <div key={i}>• {l}</div>)}</div>
      </>}
    </div>
  )
}
