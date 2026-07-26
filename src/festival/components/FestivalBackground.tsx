export function FestivalBackground() {
  return (
    <div className="fe-bg" aria-hidden="true">
      <div className="fe-bg__mesh" />
      <div className="fe-bg__orbs">
        <span className="fe-bg__orb fe-bg__orb--a" />
        <span className="fe-bg__orb fe-bg__orb--b" />
        <span className="fe-bg__orb fe-bg__orb--c" />
      </div>
      <div className="fe-bg__beams" aria-hidden="true">
        <span className="fe-bg__beam fe-bg__beam--1" />
        <span className="fe-bg__beam fe-bg__beam--2" />
        <span className="fe-bg__beam fe-bg__beam--3" />
      </div>
      <div className="fe-bg__vignette" />
      <div className="fe-bg__grain" />
    </div>
  )
}
