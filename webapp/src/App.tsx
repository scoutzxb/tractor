import { useEffect, useMemo, useRef, useState } from 'react'

type Card={id:number;suit?:'spade'|'heart'|'club'|'diamond';rank?:string;joker?:'small'|'big'}
type State=any

const suit=(s?:string)=>s==='spade'?'♠':s==='heart'?'♥':s==='club'?'♣':'♦'
const txt=(c:Card)=>c.joker==='big'?'JOKER':c.joker==='small'?'joker':`${suit(c.suit)}${c.rank}`
const cls=(c:Card)=>c.joker==='big'?'pcard p-jbig':c.joker==='small'?'pcard p-jsmall':(c.suit==='heart'||c.suit==='diamond')?'pcard p-red':'pcard p-black'

const suitOrderDesc:Record<string,number>={spade:4,heart:3,club:2,diamond:1}
const rankOrderDesc:Record<string,number>={'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14}

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

async function post(path:string,body:any){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json()}

export function App(){
  // Player registration state
  const [view, setView] = useState<'lobby' | 'game'>('lobby')
  const [playerName, setPlayerName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [playerSeat, setPlayerSeat] = useState<'north' | 'south'>('south')
  const [playerToken, setPlayerToken] = useState('')
  const [joinSessionId, setJoinSessionId] = useState('')
  
  // Game state
  const [state, setState] = useState<State|null>(null)
  const [mode, setMode] = useState('grab')
  const [playerMode, setPlayerMode] = useState<'single' | 'two'>('single')
  const [level, setLevel] = useState('2')
  const [dealer, setDealer] = useState('south')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<string[]>([])
  const [showReview, setShowReview] = useState(false)
  const [showKitty, setShowKitty] = useState(false)
  const [showSaves, setShowSaves] = useState(false)
  const [savedGames, setSavedGames] = useState<any[]>([])
  const [postDealRemaining, setPostDealRemaining] = useState<number>(0) // 倒计时剩余毫秒
  const timerRef = useRef<number|undefined>(undefined)
  const hasTakenKitty = useRef<boolean>(false) // 防止重复拿底牌

  const add = (s:string) => setLogs(x => [s, ...x].slice(0, 40))

  // Save game
  const saveGame = async (saveName?: string) => {
    if (!sessionId) return
    const d = await post('/api/save-game', { sessionId, saveName })
    if (d.ok) {
      add(d.message || '游戏已保存')
    } else {
      add(d.error || '保存失败')
    }
  }

  // Load game
  const loadGame = async (filename: string) => {
    const d = await post('/api/load-game', { 
      filename, 
      desiredSeat: playerSeat, 
      playerToken 
    })
    if (d.ok) {
      setSessionId(d.sessionId)
      setPlayerToken(d.playerToken)
      setPlayerSeat(d.playerSeat)
      setState(d.state)
      setView('game')
      setShowSaves(false)
      add(d.message || '游戏已加载')
    } else {
      add(d.error || '加载失败')
    }
  }

  // List saves
  const listSaves = async () => {
    const d = await post('/api/list-saves', {})
    if (d.ok) {
      setSavedGames(d.saves || [])
      setShowSaves(true)
    } else {
      add(d.error || '获取存档列表失败')
    }
  }

  // Quick load most recent save
  const quickLoad = async () => {
    const d = await post('/api/quick-load', { desiredSeat: playerSeat })
    if (d.ok) {
      setSessionId(d.sessionId)
      setPlayerToken(d.playerToken)
      setPlayerSeat(d.playerSeat)
      setState(d.state)
      setView('game')
      add(d.message || '已加载最新存档')
    } else {
      add(d.error || '快速加载失败')
    }
  }

  // Delete save
  const deleteSave = async (filename: string) => {
    if (!confirm('确定要删除这个存档吗？')) return
    const d = await post('/api/delete-save', { filename })
    if (d.ok) {
      setSavedGames(savedGames.filter(s => s.filename !== filename))
      add(d.message || '存档已删除')
    } else {
      add(d.error || '删除失败')
    }
  }

  // Lobby actions
  const createGame = async () => {
    if (!playerName.trim()) {
      alert('请输入你的名字')
      return
    }
    const d = await post('/api/new-game', { mode, level, dealer, playerMode })
    if (d.error) return add(d.error)
    
    // Auto-join as south
    const joinResp = await post('/api/join-game', {
      sessionId: d.sessionId,
      desiredSeat: 'south',
      playerName: playerName.trim()
    })
    
    if (joinResp.error) return add(joinResp.error)
    
    setSessionId(d.sessionId)
    setPlayerToken(joinResp.playerToken)
    setPlayerSeat('south')
    setState(joinResp.state)
    setView('game')
    if (playerMode === 'single') {
      setLogs([`单机模式开始！你是南家。`])
    } else {
      setLogs([`游戏创建成功！你是南家。等待北家加入... (游戏ID: ${d.sessionId})`])
    }
  }

  const joinGame = async () => {
    if (!playerName.trim()) {
      alert('请输入你的名字')
      return
    }
    if (!joinSessionId.trim()) {
      alert('请输入游戏ID')
      return
    }
    
    const d = await post('/api/join-game', {
      sessionId: joinSessionId.trim(),
      desiredSeat: 'north',
      playerName: playerName.trim()
    })
    
    if (d.error) {
      alert(d.error)
      return add(d.error)
    }
    
    setSessionId(joinSessionId.trim())
    setPlayerToken(d.playerToken)
    setPlayerSeat('north')
    if (d.playerMode) setPlayerMode(d.playerMode) // Set playerMode from server response
    setState(d.state)
    setView('game')
    if (d.playerMode === 'two') {
      setLogs([`成功加入双人游戏！你是北家。等待南家启动游戏...`])
    } else {
      setLogs([`成功加入游戏！你是北家。`])
    }
  }

  // Game actions
  const tick = async () => {
    if (!sessionId) return
    const d = await post('/api/tick', { sessionId, playerSeat })
    if (d.error) {
      // If dealing is done, check if we're in postDeal phase
      if (d.error === 'dealing already done') {
        const stateResp = await post('/api/state', { sessionId, playerSeat })
        if (!stateResp.error) {
          setState(stateResp)
          if (stateResp.phase === 'postDeal') {
            add('发牌完成！还有5秒可以补亮...')
          } else {
            add('发牌完成！')
          }
        }
      } else {
        add(d.error)
      }
      return
    }
    d.declarations?.forEach((x: any) => add(`亮主 ${x.seat}: ${x.cards}`))
    setState(d.state)
    setSelected(new Set())
  }

  // PostDeal阶段tick（检查是否超时）
  const postDealTick = async () => {
    if (!sessionId) return
    const d = await post('/api/post-deal-tick', { sessionId, playerSeat })
    if (d.error) {
      add(d.error)
      return
    }
    if (d.remainingMs > 0) {
      setPostDealRemaining(d.remainingMs)
    } else {
      setPostDealRemaining(0)
      if (d.phase !== 'postDeal') {
        add('亮主阶段结束，进入下一阶段')
      }
    }
    setState(d.state)
  }

  const declare = async (key: string) => {
    const endpoint = playerSeat === 'south' ? '/api/declare-manual' : '/api/declare-north'
    const d = await post(endpoint, { sessionId, key, playerSeat })
    if (d.error) return add(d.error)
    add(`你亮主成功: ${d.label}`)
    setState(d.state)
    setSelected(new Set())
  }

  const takeKitty = async () => {
    const d = await post('/api/take-kitty', { sessionId, playerSeat })
    if (d.error) return add(d.error)
    setSelected(new Set())
    setState(d.state)
  }

  const discard = async () => {
    if (selected.size !== 6) return add('请先选6张')
    const endpoint = playerSeat === 'south' ? '/api/discard-manual' : '/api/discard-north'
    const d = await post(endpoint, { sessionId, cardIds: [...selected], playerSeat })
    if (d.error) return add(d.error)
    setSelected(new Set())
    setState(d.state)
  }

  const runChaodi = async () => {
    const d = await post('/api/run-chaodi', { sessionId, skipSouth: true, playerSeat })
    if (d.error) return add(d.error)
    ;(d.logs || []).forEach((x: string) => add(`炒底: ${x}`))
    setState(d.state)
    setSelected(new Set())
  }

  const doChaodi = async (key: string) => {
    const endpoint = playerSeat === 'south' ? '/api/chao-di-manual' : '/api/chao-di-north'
    const d = await post(endpoint, { sessionId, key, playerSeat })
    if (d.error) return add(d.error)
    add(`你炒底成功: ${d.label}`)
    setState(d.state)
    setSelected(new Set())
  }

  const runPlay = async () => {
    const d = await post('/api/run-play', { sessionId })
    if (d.error) return add(d.error)
    ;(d.logs || []).forEach((x: string) => add(`出牌: ${x}`))
    setState(d.state)
    setSelected(new Set())
  }

  const playHuman = async () => {
    if (!state) return
    const inHand = new Set((state.myHand || []).map((c: Card) => String(c.id)))
    const safe = [...selected].filter(id => inHand.has(id))
    if (safe.length === 0) return add('请先选择你手里的牌')
    if (state.phase === 'play' && state.currentTurn === playerSeat && leadCount > 0 && safe.length !== requiredCount) {
      return add(`本轮需要出 ${requiredCount} 张牌，你当前选了 ${safe.length} 张`)
    }
    const endpoint = playerSeat === 'south' ? '/api/play-human' : '/api/play-north'
    const d = await post(endpoint, { sessionId, cardIds: safe })
    if (d.error) return add(d.error)
    setSelected(new Set())
    ;(d.events || []).forEach((x: string) => add(`系统: ${x}`))
    if (d.winner) add(`本轮胜者: ${d.winner}，得分: ${d.points}`)
    setState(d.state)
  }

  const nextGame = async () => {
    if (!sessionId) return
    const nextMode = state?.gameResult?.nextMode ?? mode
    const nextLevel = state?.gameResult?.nextLevel ?? level
    const nextDealer = state?.gameResult?.nextDealer ?? dealer
    const d = await post('/api/next-game', { sessionId, mode: nextMode, level: nextLevel, dealer: nextDealer, playerMode, playerSeat })
    if (d.error) return add(d.error)
    setSessionId(d.sessionId)
    setState(d)
    setSelected(new Set())
    setMode(d.mode ?? nextMode)
    setLevel(d.level ?? nextLevel)
    setDealer(d.dealer ?? nextDealer)
    setLogs([`新局开始: ${d.mode ?? nextMode}模式, ${d.level ?? nextLevel}级, 庄家${d.dealer ?? nextDealer}`])
  }

  useEffect(() => {
    if (state && state.phase === 'dealing') {
      timerRef.current = window.setInterval(() => { tick() }, 500)
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [state?.phase, sessionId])

  // PostDeal阶段：定时检查是否超时
  useEffect(() => {
    if (!state || state.phase !== 'postDeal' || !sessionId) return
    
    const pollInterval = window.setInterval(async () => {
      await postDealTick()
    }, 500)
    
    return () => window.clearInterval(pollInterval)
  }, [state?.phase, sessionId])

  // Poll for player joining in two-player waiting mode
  useEffect(() => {
    if (playerMode !== 'two' || !sessionId || !state || state.phase !== 'waiting') return
    
    const pollInterval = window.setInterval(async () => {
      const d = await post('/api/state', { sessionId, playerSeat })
      if (d.error) return
      
      // Check if both players joined (for south: check north joined; for north: check game started)
      if (playerSeat === 'south') {
        // South is the host, check if north joined
        if (d.connectedPlayers && d.connectedPlayers.includes('north')) {
          add('北家已加入！游戏开始...')
          window.clearInterval(pollInterval)
          
          // Call start-game to begin
          const startResp = await post('/api/start-game', { sessionId, playerSeat })
          if (startResp.error) {
            add(startResp.error)
          } else {
            setState(startResp.state)
            add('游戏已开始，正在发牌...')
          }
        } else {
          setState(d)
        }
      } else {
        // North is waiting for south to start the game
        if (d.phase && d.phase !== 'waiting') {
          add('南家已启动游戏！')
          window.clearInterval(pollInterval)
          setState(d)
        } else {
          setState(d)
        }
      }
    }, 2000)
    
    return () => window.clearInterval(pollInterval)
  }, [playerMode, sessionId, state?.phase, playerSeat])

  useEffect(() => {
    if (!state?.myHand) return
    const inHand = new Set((state.myHand || []).map((c: Card) => String(c.id)))
    setSelected(prev => {
      const next = new Set([...prev].filter(id => inHand.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [state?.myHand, state?.phase])

  useEffect(() => {
    if (!sessionId || !state) return
    if (state.phase === 'play') {
      post('/api/advance-play', { sessionId, playerSeat }).then((d: any) => {
        if (d?.events) d.events.forEach((x: string) => add(`系统: ${x}`))
        if (d?.state) setState(d.state)
      })
    }
  }, [sessionId, state?.phase, state?.currentTurn])

  // Poll for opponent's play in two-player mode
  useEffect(() => {
    if (playerMode !== 'two' || !sessionId || !state || state.phase !== 'play') return
    // Only poll when it's not my turn (waiting for opponent)
    if (state.currentTurn === playerSeat) return
    
    const pollInterval = window.setInterval(async () => {
      const d = await post('/api/state', { sessionId, playerSeat })
      if (d.error) return
      
      // Check if state changed (opponent played)
      if (d.currentTurn !== state.currentTurn || d.waitingNextRound !== state.waitingNextRound) {
        setState(d)
        // Also run advance-play to trigger AI moves if needed
        const advResp = await post('/api/advance-play', { sessionId, playerSeat })
        if (advResp?.events) {
          advResp.events.forEach((x: string) => add(`系统: ${x}`))
        }
        if (advResp?.state) setState(advResp.state)
      }
    }, 1500)
    
    return () => window.clearInterval(pollInterval)
  }, [playerMode, sessionId, state?.phase, state?.currentTurn, playerSeat])

  useEffect(() => {
    if (state?.phase === 'done') {
      const t = setTimeout(nextGame, 1500)
      return () => clearTimeout(t)
    }
  }, [state?.phase])

  useEffect(() => {
    if (!sessionId || !state || state.phase !== 'play' || !state.waitingNextRound) return
    const t = setTimeout(() => {
      post('/api/next-round', { sessionId, playerSeat }).then((d: any) => {
        if (d?.events) d.events.forEach((x: string) => add(`系统: ${x}`))
        if (d?.state) setState(d.state)
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [sessionId, state?.phase, state?.waitingNextRound])

  useEffect(() => {
    // 当 phase 变化时重置 hasTakenKitty
    if (state?.phase !== 'kitty') {
      hasTakenKitty.current = false
    }
    // 只在 kitty 阶段、玩家是底牌持有者、有底牌、且还没拿过时自动拿
    if (state?.phase === 'kitty' && state.kittyHolder === playerSeat && state.kittyCards && state.kittyCards.length > 0 && !hasTakenKitty.current) {
      hasTakenKitty.current = true
      takeKitty()
    }
  }, [state?.phase, state?.kittyHolder, state?.kittyCards, sessionId])

  const hand: Card[] = state?.myHand || []
  const sorted = useMemo(() => sortHand(hand, state?.level || level, state?.trump?.suit || null), [hand, state?.level, state?.trump?.suit, level])
  const table = state?.tablePlays || { south: [], east: [], north: [], west: [] }
  const leadCount = (table.east?.length || table.north?.length || table.west?.length || table.south?.length || 0)
  const isMyTurn = state?.phase === 'play' && state?.currentTurn === playerSeat
  const isLeading = isMyTurn && leadCount === 0
  const requiredCount = (isMyTurn && leadCount > 0) ? leadCount : 1
  const isKittyDiscard = state?.phase === 'kitty'

  const dealerSeat = state?.dealer
  const partner: Record<string, string> = { east: 'west', west: 'east', north: 'south', south: 'north' }
  const dealerTeam = dealerSeat ? new Set([dealerSeat, partner[dealerSeat]]) : new Set<string>()
  const allSeats = ['east', 'north', 'west', 'south']
  const defenderSeats = allSeats.filter(s => !dealerTeam.has(s))
  const defenderTotal = state?.scores ? defenderSeats.reduce((sum, s) => sum + (state.scores[s] || 0), 0) : 0
  const defenderPointCards: Card[] = state?.defenderPointCards || []

  // Render lobby view
  if (view === 'lobby') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">拖拉机 (Tractor) - 远程多人游戏</h1>
        
        <div className="panel mb-4">
          <label className="block mb-2 font-bold">你的名字:</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="输入你的名字"
          />
        </div>

        <div className="panel mb-4">
          <h2 className="text-xl font-bold mb-2">创建新游戏</h2>
          <div className="flex gap-2 mb-2">
            <select value={playerMode} onChange={e => setPlayerMode(e.target.value as 'single' | 'two')} className="p-2 border rounded">
              <option value="single">单机模式</option>
              <option value="two">双人模式</option>
            </select>
            <select value={mode} onChange={e => setMode(e.target.value)} className="p-2 border rounded">
              <option value="grab">抢庄</option>
              <option value="normal">普通</option>
            </select>
            <select value={level} onChange={e => setLevel(e.target.value)} className="p-2 border rounded">
              {['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(x => <option key={x}>{x}</option>)}
            </select>
            <select value={dealer} onChange={e => setDealer(e.target.value)} className="p-2 border rounded">
              {['south', 'east', 'north', 'west'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <button onClick={createGame} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            创建游戏（你将成为南家）
          </button>
          {playerMode === 'two' && (
            <p className="text-sm text-gray-600 mt-2">双人模式：创建游戏后需等待北家加入</p>
          )}
        </div>

        <div className="panel mb-4">
          <h2 className="text-xl font-bold mb-2">加入现有游戏</h2>
          <input
            type="text"
            value={joinSessionId}
            onChange={e => setJoinSessionId(e.target.value)}
            className="w-full p-2 border rounded mb-2"
            placeholder="输入游戏ID"
          />
          <button onClick={joinGame} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            加入游戏（你将成为北家）
          </button>
        </div>

        <div className="panel small text-gray-600">
          <p className="mb-2"><strong>游戏流程：</strong></p>
          <ol className="list-decimal list-inside">
            <li>玩家A创建游戏，自动成为南家</li>
            <li>玩家A将游戏ID分享给玩家B</li>
            <li>玩家B输入游戏ID加入，成为北家</li>
            <li>两位玩家各自只能看到自己的手牌</li>
          </ol>
        </div>
      </div>
    )
  }

  // Render game view
  return (
    <div>
      <div className="panel mb-2">
        <strong>你是: {playerSeat === 'south' ? '南家' : '北家'}</strong>
        <span className="ml-4 text-sm text-gray-600">游戏ID: {sessionId}</span>
        <button 
          onClick={() => setView('lobby')} 
          className="ml-4 px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
        >
          返回大厅
        </button>
        <button 
          onClick={() => saveGame()} 
          className="ml-2 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
        >
          保存游戏
        </button>
        <button 
          onClick={listSaves} 
          className="ml-2 px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          读取存档
        </button>
      </div>

      {/* Saves modal */}
      {showSaves && (
        <div className="panel">
          <div className="flex justify-between items-center mb-2">
            <b>存档列表</b>
            <button onClick={() => setShowSaves(false)} className="text-sm">关闭</button>
          </div>
          {savedGames.length === 0 ? (
            <p className="text-gray-600">暂无存档</p>
          ) : (
            <div className="space-y-2">
              {savedGames.map((save: any) => (
                <div key={save.filename} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                  <div>
                    <div className="font-medium">{save.filename}</div>
                    <div className="text-sm text-gray-600">
                      阶段: {save.phase} | 级别: {save.level} | 庄家: {save.dealer}
                      {save.savedAt && <span className="ml-2">保存时间: {new Date(save.savedAt).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => loadGame(save.filename)}
                      className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      读取
                    </button>
                    <button 
                      onClick={() => deleteSave(save.filename)}
                      className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <select value={mode} onChange={e => setMode(e.target.value)} disabled>
          <option value="grab">grab</option>
          <option value="normal">normal</option>
        </select>
        <select value={level} onChange={e => setLevel(e.target.value)} disabled>
          {['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'].map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={dealer} onChange={e => setDealer(e.target.value)} disabled>
          {['south', 'east', 'north', 'west'].map(x => <option key={x}>{x}</option>)}
        </select>
        <button onClick={() => setShowReview(v => !v)} disabled={!state || !state.lastRoundReview}>复盘上一轮</button>
        <button onClick={() => setShowKitty(v => !v)} disabled={!state || state.kittyHolder !== playerSeat}>
          {showKitty ? '隐藏底牌' : '查看底牌'}
        </button>
      </div>

      {state && (
        <>
          <div className="panel small">阶段: {state.phase} | 模式: {state.mode} | 主: {state.trump ? `${state.trump.suitName}/${state.trump.declarer}` : '未亮主'} | 当前行动: {state.currentTurn || '-'}</div>
          
          <div className="panel">
            <b>得分: {defenderTotal}</b>
            <div className="cards">{defenderPointCards.map((c: Card, idx: number) => <span key={`${c.id}-${idx}`} className={cls(c)}>{txt(c)}</span>)}</div>
          </div>

          {showKitty && state.kittyHolder === playerSeat && (
            <div className="panel">
              <b>底牌</b>
              <div className="cards">{(state.kittyCards || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div>
            </div>
          )}

          {state.connectedPlayers && (
            <div className="panel small">
              已连接玩家: {state.connectedPlayers.join(', ')}
              {state.waitingFor && state.waitingFor.length > 0 && (
                <span className="text-orange-600 ml-2">等待: {state.waitingFor.join(', ')}</span>
              )}
            </div>
          )}

          {state.phase === 'play' && state.currentTurn === playerSeat && (
            <div className="panel small">
              {leadCount === 0 ? `你是首家：可出同门任意张（当前已选 ${selected.size}）` : `你当前需出牌张数：${requiredCount}（已选 ${selected.size}）`}
            </div>
          )}

          <div className="panel">
            <b>亮主选项</b>
            <div className="matrix">{(state.declareOptions || []).map((o: any) => <button key={o.key} onClick={() => declare(o.key)}>{o.label}</button>)}</div>
          </div>

          {state.phase === 'kitty' && state.kittyHolder === playerSeat && state.awaitingDiscard && (
            <div className="panel">
              <b>请选择6张牌扣底（当前选了{selected.size}张）</b>
              <button onClick={discard}>确认扣底</button>
            </div>
          )}

          {state.phase === 'chaodi' && (
            <div className="panel">
              <div className="matrix">{(state.chaoDiOptions || []).map((o: any) => <button key={o.key} onClick={() => doChaodi(o.key)}>{o.label}</button>)}</div>
              <button onClick={runChaodi}>让AI继续炒底链</button>
            </div>
          )}

          {state.phase === 'postDeal' && (
            <div className="panel">
              <b>发牌完成！还有 {Math.ceil(postDealRemaining / 1000)} 秒可以补亮</b>
              <div className="small text-gray-600">期间可以继续亮主，时间到后自动进入下一阶段</div>
            </div>
          )}

          {state.phase === 'done' && (
            <div className="panel">
              本局已完成。自动进入下一局...
            </div>
          )}

          <div className="panel">
            <b>本轮出牌（四家分开）</b>
            <div className="small">east</div>
            <div className="cards">{(table.east || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div>
            <div className="small">north</div>
            <div className="cards">{(table.north || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div>
            <div className="small">west</div>
            <div className="cards">{(table.west || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div>
            <div className="small">south</div>
            <div className="cards">{(table.south || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</div>
          </div>

          {showReview && state.lastRoundReview && (
            <div className="panel">
              <b>上一轮复盘（第{state.lastRoundReview.round}轮）</b>
              <div className="small">胜者: {state.lastRoundReview.winner} | 得分: {state.lastRoundReview.points}</div>
              {state.lastRoundReview.plays?.map((p: any) => (
                <div key={p.seat}>
                  <span className="small">{p.seat}</span>
                  <span className="cards">{(p.cards || []).map((c: Card) => <span key={c.id} className={cls(c)}>{txt(c)}</span>)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="panel">
            <b>你的手牌 ({playerSeat === 'south' ? '南家' : '北家'})</b>
            <div className="cards">
              {sorted.map(c => {
                const id = String(c.id)
                const on = selected.has(id)
                return (
                  <span
                    key={id}
                    onClick={() => {
                      const n = new Set(selected)
                      n.has(id) ? n.delete(id) : n.add(id)
                      if (isKittyDiscard && n.size > 6) n.delete(id)
                      setSelected(n)
                    }}
                    className={`${cls(c)} ${on ? 'sel' : ''}`}
                  >
                    {txt(c)}
                  </span>
                )
              })}
            </div>
            {state.phase === 'play' && state.currentTurn === playerSeat && (
              <button
                onClick={playHuman}
                disabled={selected.size === 0 || (leadCount > 0 && selected.size !== requiredCount)}
                style={{ marginTop: '8px' }}
              >
                出选中牌{selected.size ? ` (${selected.size}张)` : ''}
              </button>
            )}
          </div>

          <div className="panel small">{logs.map((l, i) => <div key={i}>• {l}</div>)}</div>
        </>
      )}
    </div>
  )
}
