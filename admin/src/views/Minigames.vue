<template>
  <el-card>
    <el-radio-group v-model="game" @change="load">
      <el-radio-button value="zuma">祖玛</el-radio-button>
      <el-radio-button value="cutrope">割绳子</el-radio-button>
      <el-radio-button value="kingdomrush">王国保卫战</el-radio-button>
    </el-radio-group>
    <div ref="chart" class="chart"></div>
    <el-table :data="items">
      <el-table-column type="index" label="#" width="60" />
      <el-table-column prop="nickname" label="玩家" />
      <el-table-column prop="score" label="分数" />
      <el-table-column prop="result" label="结果" />
      <el-table-column prop="levelNo" label="关卡" />
      <el-table-column prop="stars" label="星" />
      <el-table-column prop="playedAt" label="时间" />
    </el-table>
  </el-card>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import http from '../api'

const game = ref('zuma')
const items = ref([])
const chart = ref(null)
let view

async function load() {
  const body = await http.get('/minigames', { params: { game: game.value } })
  items.value = body.items
  await nextTick()
  if (!view) view = echarts.init(chart.value)
  view.setOption({
    tooltip: {},
    xAxis: { type: 'category', data: items.value.map((item) => item.nickname) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: items.value.map((item) => item.score) }]
  })
}

onMounted(load)
</script>

<style scoped>
.chart { height: 260px; margin: 12px 0; }
</style>
