import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  POTION_COST_COINS,
  POTION_HEAL_AMOUNT,
  type PotionPromptSnapshot,
} from '../game/potionSystem';
import { useIsPc } from '../utils/platform';

export interface PotionPromptHudHandle {
  updatePrompt: (
    snapshot: PotionPromptSnapshot,
    coins: number,
    hp: number,
    maxHp: number,
  ) => void;
  triggerDenyShake: () => void;
  reset: () => void;
}

interface PotionPromptHudProps {
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

const RING_RADIUS = 21;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const PotionPromptHud = forwardRef<PotionPromptHudHandle, PotionPromptHudProps>(
  function PotionPromptHud({ onHoldStart, onHoldEnd }, ref) {
    const isPc = useIsPc();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const wheelSvgRef = useRef<SVGSVGElement | null>(null);
    const progressCircleRef = useRef<SVGCircleElement | null>(null);
    const letterBoxRef = useRef<HTMLDivElement | null>(null);
    const healLabelRef = useRef<HTMLSpanElement | null>(null);

    const visibleRef = useRef(false);
    const holdingPointerRef = useRef(false);
    const shakeTimerRef = useRef<number>(0);

    useImperativeHandle(
      ref,
      () => ({
        updatePrompt: (snapshot, coins, hp, maxHp) => {
          const root = rootRef.current;
          const btn = buttonRef.current;
          const ring = progressCircleRef.current;
          if (!root || !btn || !ring) return;

          if (!snapshot.visible) {
            if (visibleRef.current) {
              visibleRef.current = false;
              root.style.display = 'none';
            }
            if (holdingPointerRef.current) {
              holdingPointerRef.current = false;
              onHoldEnd();
            }
            return;
          }

          if (!visibleRef.current) {
            visibleRef.current = true;
            root.style.display = 'block';
          }

          root.style.transform = `translate3d(${snapshot.screenX.toFixed(1)}px, ${snapshot.screenY.toFixed(1)}px, 0) translate(-50%, -100%)`;

          const enoughCoins = coins >= POTION_COST_COINS;
          const needsHeal = hp < maxHp;
          const canUse = enoughCoins && needsHeal;
          const clampedProgress = Math.max(0, Math.min(1, snapshot.progress));

          const dashOffset = RING_CIRCUMFERENCE * (1 - clampedProgress);
          ring.style.strokeDashoffset = dashOffset.toFixed(2);
          ring.style.stroke = snapshot.holding
            ? '#39FF14'
            : canUse
              ? 'rgba(255, 255, 255, 0.85)'
              : 'rgba(255, 118, 134, 0.72)';

          if (wheelSvgRef.current) {
            const spinDeg = snapshot.holding ? -90 + clampedProgress * 720 : -90;
            wheelSvgRef.current.style.transform = `rotate(${spinDeg.toFixed(1)}deg)`;
          }

          if (snapshot.holding) {
            btn.style.borderColor = 'rgba(57, 255, 20, 0.72)';
            btn.style.backgroundColor = 'rgba(13, 30, 22, 0.56)';
            btn.style.boxShadow =
              '0 8px 22px rgba(10, 20, 14, 0.5), 0 0 16px rgba(57, 255, 20, 0.28)';
            btn.style.transform = 'scale(0.96)';
          } else {
            btn.style.borderColor = canUse
              ? 'rgba(255, 255, 255, 0.34)'
              : 'rgba(255, 130, 145, 0.38)';
            btn.style.backgroundColor = 'rgba(12, 16, 30, 0.48)';
            btn.style.boxShadow = '0 8px 20px rgba(6, 10, 22, 0.45)';
            btn.style.transform = 'scale(1)';
          }

          if (letterBoxRef.current) {
            letterBoxRef.current.style.color = snapshot.holding
              ? '#9EFF8E'
              : canUse
                ? '#FFFFFF'
                : '#FFB4BF';
          }

          if (healLabelRef.current) {
            healLabelRef.current.style.color = snapshot.holding
              ? '#7CFF6B'
              : canUse
                ? 'rgba(255, 255, 255, 0.94)'
                : 'rgba(255, 165, 178, 0.85)';
          }
        },
        triggerDenyShake: () => {
          const btn = buttonRef.current;
          if (!btn) return;
          window.clearTimeout(shakeTimerRef.current);
          btn.style.transition = 'transform 60ms ease';
          btn.style.transform = 'translateX(-6px)';
          shakeTimerRef.current = window.setTimeout(() => {
            if (!buttonRef.current) return;
            buttonRef.current.style.transform = 'translateX(6px)';
            shakeTimerRef.current = window.setTimeout(() => {
              if (!buttonRef.current) return;
              buttonRef.current.style.transform = 'translateX(0px)';
              buttonRef.current.style.transition =
                'transform 90ms cubic-bezier(0.16, 1, 0.3, 1), border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease';
            }, 65);
          }, 65);
        },
        reset: () => {
          visibleRef.current = false;
          holdingPointerRef.current = false;
          if (rootRef.current) {
            rootRef.current.style.display = 'none';
          }
          if (progressCircleRef.current) {
            progressCircleRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
          }
          if (wheelSvgRef.current) {
            wheelSvgRef.current.style.transform = 'rotate(-90deg)';
          }
        },
      }),
      [onHoldEnd],
    );

    const sizePx = isPc ? 84 : 78;
    const svgSize = isPc ? 46 : 42;

    return (
      <div
        ref={rootRef}
        className="pointer-events-none fixed left-0 top-0 z-30 select-none"
        style={{
          display: 'none',
          willChange: 'transform',
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={`Hold E for 3 seconds to Heal (${POTION_HEAL_AMOUNT} HP, ${POTION_COST_COINS} coins)`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isPc) e.currentTarget.blur();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignore pointer capture restrictions
            }
            holdingPointerRef.current = true;
            onHoldStart();
          }}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch {
              // Ignore pointer release restrictions
            }
            if (holdingPointerRef.current) {
              holdingPointerRef.current = false;
              onHoldEnd();
            }
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            if (holdingPointerRef.current) {
              holdingPointerRef.current = false;
              onHoldEnd();
            }
          }}
          onLostPointerCapture={() => {
            if (holdingPointerRef.current) {
              holdingPointerRef.current = false;
              onHoldEnd();
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="pointer-events-auto relative flex flex-col items-center justify-center gap-1 rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            backgroundColor: 'rgba(12, 16, 30, 0.48)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '2.5px solid rgba(255, 255, 255, 0.34)',
            boxShadow: '0 8px 20px rgba(6, 10, 22, 0.45)',
            transition:
              'transform 90ms cubic-bezier(0.16, 1, 0.3, 1), border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease',
            touchAction: 'none',
          }}
        >
          {/* Minimalist spinning & filling progress wheel with centered E */}
          <div
            className="relative flex items-center justify-center"
            style={{ width: `${svgSize}px`, height: `${svgSize}px` }}
          >
            <svg
              ref={wheelSvgRef}
              width={svgSize}
              height={svgSize}
              viewBox="0 0 56 56"
              aria-hidden="true"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle
                cx="28"
                cy="28"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="4.2"
              />
              <circle
                ref={progressCircleRef}
                cx="28"
                cy="28"
                r={RING_RADIUS}
                fill="none"
                stroke="#39FF14"
                strokeWidth="4.4"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE}
                style={{
                  filter: 'drop-shadow(0 0 5px rgba(57, 255, 20, 0.7))',
                }}
              />
            </svg>
            <div
              ref={letterBoxRef}
              className="absolute flex items-center justify-center font-cartoon font-extrabold leading-none text-white"
              style={{
                fontSize: isPc ? '17px' : '15px',
                textShadow: '0 1.5px 0 #0B0D18',
              }}
            >
              E
            </div>
          </div>

          <span
            ref={healLabelRef}
            className="font-cartoon font-bold leading-none tracking-wide text-white"
            style={{
              fontSize: isPc ? '12px' : '11px',
              textShadow: '0 1.5px 0 #0B0D18',
            }}
          >
            Heal
          </span>
        </button>
      </div>
    );
  },
);
