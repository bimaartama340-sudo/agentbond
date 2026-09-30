import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  Coins,
  Gauge,
  ExternalLink,
  Play,
  Plus,
  Radar,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type Agent = {
  id: string;
  name: string;
  role: string;
  state: string;
  detail: string;
  icon: typeof Bot;
  color: string;
};
const seed: Agent[] = [
  {
    id: "scan",
    name: "SCAN",
    role: "Security agent",
    state: "RUNNING",
    detail: "Contract and wallet checks",
    icon: ScanLine,
    color: "#b9f35b",
  },
  {
    id: "route",
    name: "ROUTE",
    role: "Liquidity agent",
    state: "READY",
    detail: "Meteora route planning",
    icon: Radar,
    color: "#7ba8ff",
  },
  {
    id: "guard",
    name: "GUARD",
    role: "Policy agent",
    state: "PAUSED",
    detail: "Approval and spending rules",
    icon: ShieldCheck,
    color: "#a888ed",
  },
];

function MeteoraPipeline() {
  const stages = [
    ["01", "DBC", "Price discovery", "Curve progress 74%", "active"],
    ["02", "DAMM v2", "Graduation target", "Migration ready", "next"],
    ["03", "DLMM", "Agent liquidity", "Fee-aware routing", "planned"],
  ];
  return (
    <div className="meteora-pipeline">
      <div className="pipeline-heading">
        <div>
          <span className="section-kicker">METEORA CONTROL PLANE</span>
          <h2>Every agent action has a liquidity path.</h2>
        </div>
        <a href="https://docs.meteora.ag/" target="_blank" rel="noreferrer">
          Protocol docs <ExternalLink size={13} />
        </a>
      </div>
      <p className="pipeline-copy">
        AGNT utility starts on a configurable Dynamic Bonding Curve, graduates
        into DAMM v2 when the quote threshold is met, then uses DLMM bins for
        efficient agent-side routing.
      </p>
      <div className="pipeline-stages">
        {stages.map(([number, name, label, detail, state]) => (
          <div className={`pipeline-stage ${state}`} key={name}>
            <div className="pipeline-stage-top">
              <span>{number}</span>
              <b>{state}</b>
            </div>
            <strong>{name}</strong>
            <small>{label}</small>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="pipeline-note">
        <span className="pulse-dot" /> READ-ONLY DEVNET ADAPTER{" "}
        <b>
          mainnet deployment is gated until wallet, program, and
          redemption-vault review
        </b>
      </div>
    </div>
  );
}

export function AgentWorkspace() {
  const [agents, setAgents] = useState(seed);
  const [selectedId, setSelectedId] = useState("scan");
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [strategy, setStrategy] = useState("Balanced curve");
  const [dbcLive, setDbcLive] = useState({
    progress: 74.0,
    price: 0.0042,
    reserve: 18420,
    bin: 12,
  });
  const selected = agents.find(item => item.id === selectedId) || agents[0];
  const SelectedIcon = selected.icon;
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDbcLive(current => ({
        progress: Math.min(99, current.progress + 0.15),
        price: Number((current.price * 1.0012).toFixed(5)),
        reserve: current.reserve + 38,
        bin: current.bin + (Math.random() > 0.72 ? 1 : 0),
      }));
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);
  const runTask = () => {
    setRunning(true);
    setDbcLive(current => ({
      ...current,
      progress: Math.min(99, current.progress + 1.4),
      reserve: current.reserve + 220,
    }));
    setAgents(items =>
      items.map(item =>
        item.id === selected.id ? { ...item, state: "RUNNING" } : item
      )
    );
    toast.success(selected.name + " task queued", {
      description: "Local devnet mode; no transaction was signed.",
    });
    setTask("");
    window.setTimeout(() => setRunning(false), 900);
  };
  return (
    <section id="workspace" className="workspace-section container">
      <div className="workspace-heading">
        <div>
          <div className="section-kicker">
            <span className="pulse-dot" /> AGENT OPERATIONS / DEVNET
          </div>
          <h1>Run your agent economy.</h1>
          <p>
            Supervise agents, review actions, and move value through AgentBond.
            Staking and analytics stay one click away.
          </p>
        </div>
        <div className="workspace-health">
          <span className="pulse-dot" /> ALL SYSTEMS NOMINAL <b>3 agents</b>
        </div>
      </div>
      <div className="workspace-grid">
        <div className="workspace-main">
          <div className="workspace-toolbar">
            <div className="toolbar-title">
              <Bot size={16} /> Agent roster <span>3</span>
            </div>
            <div className="toolbar-filters">
              <button className="active">all</button>
              <button onClick={() => setSelectedId("scan")}>running</button>
              <button onClick={() => setSelectedId("guard")}>attention</button>
              <button
                className="workspace-add"
                onClick={() =>
                  toast("Agent templates", {
                    description: "Custom creation is next.",
                  })
                }
              >
                <Plus size={13} /> Add agent
              </button>
            </div>
          </div>
          <div className="agent-roster">
            {agents.map(agent => {
              const Icon = agent.icon;
              return (
                <button
                  key={agent.id}
                  className={
                    selected.id === agent.id
                      ? "agent-roster-card selected"
                      : "agent-roster-card"
                  }
                  onClick={() => setSelectedId(agent.id)}
                >
                  <div className="agent-roster-top">
                    <span className="agent-icon" style={{ color: agent.color }}>
                      <Icon size={16} />
                    </span>
                    <span className="agent-status">{agent.state}</span>
                  </div>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                  <p>{agent.detail}</p>
                  <div className="agent-card-metric">
                    <b>
                      {agent.id === "scan"
                        ? "12"
                        : agent.id === "route"
                          ? "98.4%"
                          : "3"}
                    </b>
                    <span>live signal</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="task-console">
            <div className="console-header">
              <span>
                <span className="console-dot" /> TASK CONSOLE
              </span>
              <span>target: {selected.name}</span>
            </div>
            <div className="task-context">
              <div className="task-target">
                <span className="agent-icon" style={{ color: selected.color }}>
                  <SelectedIcon size={16} />
                </span>
                <div>
                  <b>{selected.name}</b>
                  <small>{selected.role}</small>
                </div>
              </div>
              <div className="console-stat">
                <Gauge size={14} /> ready
              </div>
            </div>
            <div className="task-input-row">
              <TerminalSquare size={16} />
              <input
                value={task}
                onChange={event => setTask(event.target.value)}
                placeholder="Ask this agent for a task"
              />
              <button onClick={runTask} disabled={running}>
                <Play size={14} /> {running ? "Running" : "Run task"}
              </button>
            </div>
            <div className="dbc-strategy">
              <div>
                <span className="section-kicker">DBC STRATEGY SIMULATOR</span>
                <b>{strategy}</b>
              </div>
              <div className="dbc-strategy-buttons">
                {["Conservative", "Balanced curve", "Aggressive"].map(item => (
                  <button
                    key={item}
                    className={strategy === item ? "active" : ""}
                    onClick={() => setStrategy(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="dbc-live-metrics">
              <span>
                <b>{dbcLive.progress.toFixed(1)}%</b> curve
              </span>
              <span>
                <b>${dbcLive.price.toFixed(4)}</b> price
              </span>
              <span>
                <b>{dbcLive.reserve.toLocaleString()}</b> quote reserve
              </span>
              <span>
                <b>#{dbcLive.bin}</b> active bin
              </span>
            </div>
            <div className="quick-actions">
              <span>Quick actions</span>
              <button onClick={() => setTask("Health check")}>
                Health check
              </button>
              <button onClick={() => setTask("Prepare quote")}>
                Prepare quote
              </button>
              <button onClick={() => setTask("Review policy")}>
                Review policy
              </button>
            </div>
          </div>
        </div>
        <aside className="workspace-side">
          <div className="workspace-panel activity-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">LIVE FEED</span>
                <h3>Activity</h3>
              </div>
              <Activity size={16} />
            </div>
            <div className="activity-list">
              <div className="workspace-activity">
                <span className="activity-dot lime" />
                <div>
                  <p> Heartbeat healthy</p>
                  <time>now</time>
                </div>
              </div>
              <div className="workspace-activity">
                <span className="activity-dot blue" />
                <div>
                  <p> Quote prepared</p>
                  <time>3m</time>
                </div>
              </div>
              <div className="workspace-activity">
                <span className="activity-dot muted" />
                <div>
                  <p> Policy review waiting</p>
                  <time>8m</time>
                </div>
              </div>
            </div>
            <button
              className="panel-link"
              onClick={() =>
                toast("Activity history", {
                  description: "Available in analytics.",
                })
              }
            >
              View full activity
            </button>
          </div>
          GUARD ROUTE SCAN
          <div className="workspace-panel value-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">VALUE LAYER</span>
                <h3>Bonded capacity</h3>
              </div>
              <Coins size={16} />
            </div>
            <div className="value-number">
              24,680 <span>AGNT</span>
            </div>
            <div className="value-row">
              <span>Active stake</span>
              <b>18,400 AGNT</b>
            </div>
            <div className="value-row">
              <span>Available</span>
              <b className="lime-text">6,280 AGNT</b>
            </div>
            <div className="value-progress">
              <span style={{ width: "74%" }} />
            </div>
            <button
              className="panel-link"
              onClick={() =>
                document
                  .getElementById("staking")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Manage staking
            </button>
          </div>
          <div className="workspace-panel next-panel">
            <div className="next-icon">
              <Zap size={16} />
            </div>
            <div>
              <span className="section-kicker">NEXT UP</span>
              <h3>Connect your agent stack</h3>
              <p>
                Review the devnet adapter before enabling automated execution.
              </p>
              <button
                className="panel-link"
                onClick={() =>
                  toast("Adapter review", {
                    description: "Ready in devnet mode.",
                  })
                }
              >
                Open adapter review
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="workspace-footer">
        <span>
          <Check size={13} /> Local simulation mode
        </span>
        <span>
          <RefreshCw size={13} /> Last sync just now
        </span>
      </div>
    </section>
  );
}
