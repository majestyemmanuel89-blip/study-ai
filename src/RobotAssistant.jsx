import { useRef } from 'react'

export default function RobotAssistant({ mood = 'idle', attentive = false }) {
  const stageRef = useRef(null)

  function followPointer(event) {
    if (mood === 'password') return
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds) return

    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 7
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 5
    stageRef.current.style.setProperty('--gaze-x', `${x}px`)
    stageRef.current.style.setProperty('--gaze-y', `${y}px`)
    stageRef.current.style.setProperty('--robot-turn-x', `${x * 1.15}deg`)
    stageRef.current.style.setProperty('--robot-turn-y', `${y * -1.1}deg`)
  }

  function resetGaze() {
    if (!stageRef.current) return
    stageRef.current.style.setProperty('--gaze-x', attentive ? '2px' : '0px')
    stageRef.current.style.setProperty('--gaze-y', attentive ? '2px' : '0px')
    stageRef.current.style.setProperty('--robot-turn-x', attentive ? '3deg' : '0deg')
    stageRef.current.style.setProperty('--robot-turn-y', attentive ? '-2deg' : '0deg')
  }

  return (
    <div
      ref={stageRef}
      className={`robot-stage${mood === 'password' ? ' is-shy' : ''}${mood === 'loading' ? ' is-loading' : ''}${mood === 'success' ? ' is-celebrating' : ''}${attentive ? ' is-attentive' : ''}`}
      onPointerMove={followPointer}
      onPointerLeave={resetGaze}
      role="img"
      aria-label="StudyAI's friendly robot assistant"
    >
      <span className="robot-halo" aria-hidden="true" />
      <span className="robot-orbit robot-orbit-one" aria-hidden="true" />
      <span className="robot-orbit robot-orbit-two" aria-hidden="true" />
      <span className="robot-sparkle robot-sparkle-one" aria-hidden="true">✦</span>
      <span className="robot-sparkle robot-sparkle-two" aria-hidden="true">✧</span>
      <span className="robot-sparkle robot-sparkle-three" aria-hidden="true">✦</span>
      <span className="robot-ground-shadow" aria-hidden="true" />
      <span className="robot-model">
        <svg className="robot-art" viewBox="0 0 340 350" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="robot-shell" x1="83" y1="63" x2="251" y2="236" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" />
            <stop offset=".2" stopColor="#f6f8fc" />
            <stop offset=".58" stopColor="#dce3ee" />
            <stop offset=".84" stopColor="#c0cada" />
            <stop offset="1" stopColor="#8997ae" />
          </linearGradient>
          <linearGradient id="robot-body" x1="113" y1="225" x2="229" y2="335" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" />
            <stop offset=".38" stopColor="#edf1f8" />
            <stop offset=".75" stopColor="#c9d2e1" />
            <stop offset="1" stopColor="#8e9bb1" />
          </linearGradient>
          <linearGradient id="robot-side" x1="202" y1="118" x2="238" y2="193" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c1cada" stopOpacity="0" />
            <stop offset="1" stopColor="#8190a9" stopOpacity=".9" />
          </linearGradient>
          <linearGradient id="robot-metal" x1="98" y1="95" x2="240" y2="148" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" />
            <stop offset=".3" stopColor="#dbe2ee" />
            <stop offset=".55" stopColor="#f5f7fb" />
            <stop offset="1" stopColor="#aab6c9" />
          </linearGradient>
          <linearGradient id="robot-visor" x1="95" y1="97" x2="245" y2="198" gradientUnits="userSpaceOnUse">
            <stop stopColor="#314861" />
            <stop offset=".28" stopColor="#17293f" />
            <stop offset=".7" stopColor="#0c1729" />
            <stop offset="1" stopColor="#050a14" />
          </linearGradient>
          <linearGradient id="robot-eye" x1="137" y1="125" x2="151" y2="153" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8ef8ff" />
            <stop offset="1" stopColor="#36bfff" />
          </linearGradient>
          <filter id="robot-eye-glow" x="120" y="111" width="100" height="60" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id="robot-glass-glint" x1="138" y1="104" x2="180" y2="142" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" stopOpacity=".48" />
            <stop offset="1" stopColor="#8beaff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="robot-visor-clip">
            <rect x="132" y="103" width="76" height="63" rx="24" />
          </clipPath>
        </defs>

        <g className="robot-body">
          <path d="M145 319v10c0 5 4 9 9 9h12v-19h-21Zm29 0v19h12c5 0 9-4 9-9v-10h-21Z" fill="url(#robot-metal)" stroke="#8794a9" strokeWidth="2" />
          <path d="M146 332h20m9 0h20" stroke="#fff" strokeOpacity=".9" strokeWidth="2" strokeLinecap="round" />
          <path d="M119 223c0-17 14-31 31-31h40c17 0 31 14 31 31v67c0 19-15 34-34 34h-34c-19 0-34-15-34-34v-67Z" fill="url(#robot-body)" stroke="#fff" strokeOpacity=".9" strokeWidth="2" />
          <path d="M211 205c7 5 10 12 10 21v64c0 16-12 30-28 33 13-19 18-50 18-118Z" fill="url(#robot-side)" />
          <path d="M129 233c0-12 9-21 21-21h40c12 0 21 9 21 21v9h-82v-9Z" fill="url(#robot-metal)" />
          <path d="M145 267a25 25 0 0 1 50 0v34h-50v-34Z" fill="#e6ebf4" stroke="#c2ccdc" strokeWidth="1.5" />
          <path d="M151 266a19 19 0 0 1 38 0v8h-38v-8Z" fill="#fff" fillOpacity=".9" />
          <circle className="robot-chest-core" cx="170" cy="271" r="11" fill="#7855e8" />
          <circle cx="170" cy="271" r="8" stroke="#d9caff" strokeOpacity=".65" strokeWidth="1.5" />
          <circle cx="170" cy="271" r="6" fill="#a7f2ff" />
          <path d="M139 292h13m49 0h-13" stroke="#aeb9ca" strokeWidth="2" strokeLinecap="round" />
          <path d="M145 306h50" stroke="#fff" strokeOpacity=".52" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M125 254c-18 2-28 13-30 30m120-30c18 2 28 13 30 30" stroke="#c9d2e1" strokeWidth="15" strokeLinecap="round" />
          <path d="M125 251c-14 2-23 10-27 21m117-21c14 2 23 10 27 21" stroke="#f8faff" strokeOpacity=".9" strokeWidth="4" strokeLinecap="round" />
          <path d="M100 280v10m140-10v10" stroke="#f9fbff" strokeWidth="15" strokeLinecap="round" />
          <circle cx="96" cy="286" r="8" fill="url(#robot-metal)" />
          <circle cx="244" cy="286" r="8" fill="url(#robot-metal)" />

          <path d="M111 87a12 12 0 0 0-12 12v28a12 12 0 0 0 12 12h7V87h-7Zm118 0h-7v52h7a12 12 0 0 0 12-12V99a12 12 0 0 0-12-12Z" fill="url(#robot-metal)" stroke="#fff" strokeWidth="2" />
          <path d="M100 105c0-7 5-12 12-12h3v29h-3c-7 0-12-5-12-12v-5Zm140 0c0-7-5-12-12-12h-3v29h3c7 0 12-5 12-12v-5Z" fill="#a8b4c6" />
          <circle cx="110" cy="112" r="7" fill="#dbe2ed" />
          <circle cx="230" cy="112" r="7" fill="#dbe2ed" />
          <circle cx="111" cy="113" r="4" fill="#7f62eb" />
          <circle cx="229" cy="113" r="4" fill="#7f62eb" />
          <path d="M170 69V52" stroke="#c3ccdb" strokeWidth="7" strokeLinecap="round" />
          <circle className="robot-antenna" cx="170" cy="43" r="11" fill="#b99aff" stroke="#e5d7ff" strokeWidth="3" />
          <circle cx="167" cy="40" r="3" fill="white" fillOpacity=".9" />

          <path d="M118 91c0-21 17-38 38-38h28c21 0 38 17 38 38v95c0 23-18 41-41 41h-22c-23 0-41-18-41-41V91Z" fill="url(#robot-shell)" stroke="#fff" strokeWidth="2" />
          <path d="M121 95c0-20 16-36 36-36h4v164c-22-1-40-18-40-41V95Z" fill="#fff" fillOpacity=".25" />
          <path d="M222 94c0-17-14-31-31-31h-4v163c21-2 37-19 37-40V94Z" fill="url(#robot-side)" />
          <path d="M132 82c9-13 24-20 40-20h13c16 0 30 9 37 22" stroke="#fff" strokeOpacity=".9" strokeWidth="3" strokeLinecap="round" />
          <path d="M122 177v9c0 21 16 39 37 41" stroke="#fff" strokeOpacity=".46" strokeWidth="2" strokeLinecap="round" />
          <rect x="125" y="96" width="90" height="77" rx="30" fill="url(#robot-metal)" stroke="#fff" strokeOpacity=".95" strokeWidth="2" />
          <rect x="128" y="99" width="84" height="71" rx="27" fill="url(#robot-visor)" stroke="#92a9c9" strokeOpacity=".78" strokeWidth="2" />
          <rect x="132" y="103" width="76" height="63" rx="24" fill="#0b1728" stroke="#d8efff" strokeOpacity=".16" strokeWidth="1" />
          <path d="M139 107h39c-8 8-15 18-20 29h-26v-16c0-5 3-10 7-13Z" fill="url(#robot-glass-glint)" clipPath="url(#robot-visor-clip)" />
          <path d="M193 108c6 4 10 11 10 18v22" stroke="#8bdfff" strokeOpacity=".19" strokeWidth="2" strokeLinecap="round" />
          <circle cx="145" cy="137" r="12" fill="#34d8ff" fillOpacity=".45" filter="url(#robot-eye-glow)" />
          <circle cx="195" cy="137" r="12" fill="#34d8ff" fillOpacity=".45" filter="url(#robot-eye-glow)" />
          <g className="robot-eyes">
            <g className="robot-eye-left">
              <ellipse cx="145" cy="137" rx="7" ry="10" fill="url(#robot-eye)" />
              <circle className="robot-pupil" cx="145" cy="137" r="3" fill="#f4ffff" />
            </g>
            <g className="robot-eye-right">
              <ellipse cx="195" cy="137" rx="7" ry="10" fill="url(#robot-eye)" />
              <circle className="robot-pupil" cx="195" cy="137" r="3" fill="#f4ffff" />
            </g>
          </g>
          <path d="M159 151c3 4 7 6 11 6s8-2 11-6" stroke="#8aeaff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M137 181h66" stroke="#b4bfd1" strokeOpacity=".9" strokeWidth="4" strokeLinecap="round" />
          <path d="M142 180h56" stroke="#fff" strokeOpacity=".84" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="170" cy="181" r="3" fill="#a688ff" />

          <g className="robot-hands">
            <path d="M122 146c0-7 5-12 12-12h18c7 0 12 5 12 12v20c0 8-6 14-14 14h-14c-8 0-14-6-14-14v-20Z" fill="url(#robot-metal)" stroke="#8794a9" strokeWidth="2" />
            <path d="M176 146c0-7 5-12 12-12h18c7 0 12 5 12 12v20c0 8-6 14-14 14h-14c-8 0-14-6-14-14v-20Z" fill="url(#robot-metal)" stroke="#8794a9" strokeWidth="2" />
            <path d="M127 144c3-5 8-7 14-7h8c4 0 8 2 11 5m20 2c3-5 8-7 14-7h8c4 0 8 2 11 5" stroke="#fff" strokeOpacity=".95" strokeWidth="3" strokeLinecap="round" />
            <path d="M132 145v10m8-12v10m47-8v10m9-12v10" stroke="#9faec2" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
        </svg>
      </span>
      <span className="robot-caption" aria-hidden="true">
        {mood === 'password' ? 'Your secret is safe with me' : mood === 'loading' ? 'Thinking it through…' : mood === 'success' ? 'Welcome back!' : 'Your study buddy is ready'}
      </span>
      {mood === 'loading' && <span className="robot-loading-indicator" aria-hidden="true" />}
    </div>
  )
}
