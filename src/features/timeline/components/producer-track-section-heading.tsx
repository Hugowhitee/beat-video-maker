import { getProducerTrackSection } from '../utils/producer-track-sections'

export function ProducerTrackSectionHeading({
  section,
  showLabel = false,
}: {
  section: NonNullable<ReturnType<typeof getProducerTrackSection>>
  showLabel?: boolean
}) {
  return (
    <div
      data-producer-track-section={section.label.toLowerCase()}
      aria-hidden={!showLabel}
      className="flex shrink-0 items-center border-y border-border bg-program-surround px-4 text-[11px] font-semibold uppercase text-foreground"
      style={{ height: section.height }}
    >
      {showLabel ? (
        section.label
      ) : section.label === 'Visual' ? (
        <span className="text-[9px] font-normal text-muted-foreground">
          Visual stack · front above back
        </span>
      ) : null}
    </div>
  )
}
