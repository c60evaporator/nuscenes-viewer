import { describe, it, expect, beforeEach } from 'vitest'
import { useNavigationStore } from '@/store/navigationStore'

// Reset store before each test to avoid state leakage
beforeEach(() => {
  useNavigationStore.getState().unlock()
})

describe('navigationStore - initial state', () => {
  it('starts with all locked tokens null and lockSource null', () => {
    const state = useNavigationStore.getState()
    expect(state.lockedSceneToken).toBeNull()
    expect(state.lockedSampleToken).toBeNull()
    expect(state.lockedInstanceToken).toBeNull()
    expect(state.lockedCategoryName).toBeNull()
    expect(state.lockSource).toBeNull()
  })
})

describe('navigationStore - lock()', () => {
  it('sets lockSource and provided tokens', () => {
    useNavigationStore.getState().lock('scene', { sceneToken: 'scene-abc' })
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBe('scene')
    expect(state.lockedSceneToken).toBe('scene-abc')
  })

  it('sets all provided tokens at once', () => {
    useNavigationStore.getState().lock('sample', {
      sceneToken:  'scene-1',
      sampleToken: 'sample-1',
    })
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBe('sample')
    expect(state.lockedSceneToken).toBe('scene-1')
    expect(state.lockedSampleToken).toBe('sample-1')
    expect(state.lockedInstanceToken).toBeNull()
  })

  it('sets instanceToken and clears unspecified tokens to null', () => {
    useNavigationStore.getState().lock('instance', {
      sceneToken:    'scene-2',
      instanceToken: 'inst-99',
    })
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBe('instance')
    expect(state.lockedSceneToken).toBe('scene-2')
    expect(state.lockedInstanceToken).toBe('inst-99')
    expect(state.lockedSampleToken).toBeNull()
    expect(state.lockedCategoryName).toBeNull()
  })

  it('sets categoryName for sample→instance transition', () => {
    useNavigationStore.getState().lock('sample', {
      sceneToken:   'scene-3',
      categoryName: 'vehicle.car',
    })
    const state = useNavigationStore.getState()
    expect(state.lockedCategoryName).toBe('vehicle.car')
  })

  it('overwrites previous lock state', () => {
    useNavigationStore.getState().lock('scene', { sceneToken: 'old' })
    useNavigationStore.getState().lock('sample', { sceneToken: 'new', sampleToken: 'smp' })
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBe('sample')
    expect(state.lockedSceneToken).toBe('new')
    expect(state.lockedSampleToken).toBe('smp')
  })
})

describe('navigationStore - unlock()', () => {
  it('clears all locked tokens and lockSource', () => {
    useNavigationStore.getState().lock('scene', { sceneToken: 'scene-x' })
    useNavigationStore.getState().unlock()
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBeNull()
    expect(state.lockedSceneToken).toBeNull()
    expect(state.lockedSampleToken).toBeNull()
    expect(state.lockedInstanceToken).toBeNull()
    expect(state.lockedCategoryName).toBeNull()
  })

  it('is idempotent (unlock twice is safe)', () => {
    useNavigationStore.getState().unlock()
    useNavigationStore.getState().unlock()
    const state = useNavigationStore.getState()
    expect(state.lockSource).toBeNull()
  })
})

describe('navigationStore - tab switch unlock pattern', () => {
  it('lock followed by unlock simulates tab navigation correctly', () => {
    // Scene → Sample transition: lock with scene
    useNavigationStore.getState().lock('scene', { sceneToken: 'scene-abc' })
    expect(useNavigationStore.getState().lockedSceneToken).toBe('scene-abc')

    // User switches to Instance tab: Header calls unlock()
    useNavigationStore.getState().unlock()
    expect(useNavigationStore.getState().lockedSceneToken).toBeNull()
    expect(useNavigationStore.getState().lockSource).toBeNull()
  })
})
