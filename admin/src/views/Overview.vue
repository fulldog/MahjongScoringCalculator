<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="4" v-for="card in cards" :key="card.label">
        <el-card>
          <div class="label">{{ card.label }}</div>
          <div class="num">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-card class="block">
      <template #header>最近牌局</template>
      <div ref="chart" class="chart"></div>
      <el-table :data="recent" size="small">
        <el-table-column prop="code" label="房间" />
        <el-table-column prop="hostName" label="房主" />
        <el-table-column prop="status" label="状态" />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button link @click="$router.push('/matches/' + row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import http from '../api'

const data = ref(null)
const chart = ref(null)
const recent = computed(() => (data.value && data.value.recentMatches) || [])
const cards = computed(() => {
  const item = data.value || {}
  return [
    { label: '用户', value: item.userCount || 0 },
    { label: '今日新增', value: item.newUsersToday || 0 },
    { label: '进行中房间', value: item.activeRooms || 0 },
    { label: '牌局', value: item.matchCount || 0 },
    { label: '今日小游戏', value: item.minigameToday || 0 }
  ]
})

onMounted(async () => {
  data.value = await http.get('/overview')
  await nextTick()
  const view = echarts.init(chart.value)
  const rows = recent.value
  view.setOption({
    tooltip: {},
    xAxis: { type: 'category', data: rows.map((row) => row.code) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: rows.map(() => 1) }]
  })
})
</script>

<style scoped>
.label { color: #888; font-size: 13px; }
.num { margin-top: 6px; font-size: 28px; font-weight: 700; }
.block { margin-top: 16px; }
.chart { height: 220px; }
</style>
