export default function AppShell({ phase, showTabBar, activeTab, appRef, children }) {
  return (
    <div
      id="main-content"
      className={`app${phase === 'home' ? ' app--home' : ''}${showTabBar ? ' app--has-tabbar' : ''}${activeTab === 'klassenraum' ? ' app--tab-klassenraum' : ''}`}
      ref={appRef}
      tabIndex={-1}
    >
      {children}
    </div>
  )
}
