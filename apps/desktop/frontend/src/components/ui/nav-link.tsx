import type { AnchorHTMLAttributes, ReactNode } from 'react'

interface NavBarLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  text?: string
  icon?: ReactNode
  active?: boolean
  imgSrc?: string
  imgAlt?: string
  showBadge?: string | boolean
  imgBorderRadius?: string
  badgeBackgroundColor?: string
}

function NavBarLink({
  text = 'Nav Link',
  icon,
  active,
  imgSrc,
  imgAlt,
  showBadge,
  imgBorderRadius,
  badgeBackgroundColor,
  className,
  ...props
}: NavBarLinkProps) {
  return (
    <li className="sc-navbar-list-item">
      <a
        {...props}
        className={[active ? 'active' : '', className].filter(Boolean).join(' ')}
        aria-current={active ? 'page' : undefined}
        aria-selected={active ? 'true' : undefined}
      >
        {icon}
        {imgSrc ? <img src={imgSrc} alt={imgAlt} style={{ borderRadius: imgBorderRadius }} /> : null}
        <span>{text}</span>
        {showBadge ? <div className="sc-badge" style={{ backgroundColor: badgeBackgroundColor }}>{showBadge}</div> : null}
      </a>
    </li>
  )
}

export default NavBarLink
export type { NavBarLinkProps }
