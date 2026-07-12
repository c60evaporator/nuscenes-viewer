import { describe, it, expect } from 'vitest'
import { compareCategoryOrder } from '@/lib/categoryOrder'
import { ANNOTATION } from '@/config/settings'

describe('compareCategoryOrder', () => {
  it('category_order 掲載カテゴリは記載順に並ぶ', () => {
    // settings.yml: vehicle.car → vehicle.bicycle → … → human.pedestrian.adult → … → animal
    expect(compareCategoryOrder('vehicle.car', 'vehicle.bicycle')).toBeLessThan(0)
    expect(compareCategoryOrder('vehicle.truck', 'human.pedestrian.adult')).toBeLessThan(0)
    expect(compareCategoryOrder('animal', 'vehicle.car')).toBeGreaterThan(0)
  })

  it('sort に使うと settings.yml の記載順を再現する', () => {
    const shuffled = [...ANNOTATION.CATEGORY_ORDER].reverse()
    expect([...shuffled].sort(compareCategoryOrder)).toEqual(ANNOTATION.CATEGORY_ORDER)
  })

  it('未掲載カテゴリは掲載分の後ろにアルファベット順で並ぶ', () => {
    const sorted = ['movable_object.cone', 'animal', 'movable_object.barrier', 'vehicle.car']
      .sort(compareCategoryOrder)
    expect(sorted).toEqual([
      'vehicle.car', 'animal', 'movable_object.barrier', 'movable_object.cone',
    ])
  })

  it('同一カテゴリは 0 を返す', () => {
    expect(compareCategoryOrder('vehicle.car', 'vehicle.car')).toBe(0)
    expect(compareCategoryOrder('unknown.cat', 'unknown.cat')).toBe(0)
  })
})
