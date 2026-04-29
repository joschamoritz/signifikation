export default function TabTransition({ activeTab, tabs }) {
  const currentScreen = tabs[activeTab] ?? null
  const hasActiveScreen = Boolean(currentScreen)

  return (
    <div className={`tab-transition-container${hasActiveScreen ? '' : ' tab-transition-container--empty'}`}>
      {currentScreen ? (
        <div className="tab-screen tab-screen--static" key={activeTab}>
          {currentScreen}
        </div>
      ) : null}
    </div>
  )
}
