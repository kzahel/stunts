import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { GameLoop } from './GameLoop';

describe('GameLoop', () => {
    let loop: GameLoop;
    // Type as specific mocks
    let updateFn: Mock<(dt: number) => void>;
    let renderFn: Mock<(alpha: number) => void>;

    beforeEach(() => {
        updateFn = vi.fn();
        renderFn = vi.fn();
        // Target 10 ups (0.1s step)
        loop = new GameLoop(updateFn, renderFn, 10);
    });

    it('runs update mechanism correctly manually', () => {
        vi.spyOn(performance, 'now').mockReturnValue(1000);
        loop.start();

        // Advance 150ms
        loop.tick(1150);

        expect(updateFn).toHaveBeenCalledTimes(1);
        expect(updateFn).toHaveBeenCalledWith(0.1);

        expect(renderFn).toHaveBeenCalled();
        const lastRenderCall = renderFn.mock.calls[renderFn.mock.calls.length - 1];
        expect(lastRenderCall[0]).toBeCloseTo(0.5, 5);
    });

    it('accumulates time correctly', () => {
        vi.spyOn(performance, 'now').mockReturnValue(1000);
        loop.start();

        loop.tick(1050);
        expect(updateFn).not.toHaveBeenCalled();

        loop.tick(1110);

        expect(updateFn).toHaveBeenCalledTimes(1);
        expect(renderFn).toHaveBeenCalledTimes(2);

        const lastRenderCall = renderFn.mock.calls[1];
        expect(lastRenderCall[0]).toBeCloseTo(0.1, 5);
    });
});
