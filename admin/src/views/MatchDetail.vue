<template>
  <div v-if="detail">
    <el-page-header @back="$router.push('/matches')" :content="'房间 ' + detail.match.code" />
    <el-card class="block">
      <div>状态 {{ detail.match.status }} · 房主 {{ detail.match.hostName }}</div>
      <el-table :data="detail.seats" size="small" style="margin-top: 12px">
        <el-table-column prop="seat" label="座位" />
        <el-table-column prop="nickname" label="玩家" />
        <el-table-column prop="score" label="总分" />
      </el-table>
    </el-card>
    <el-card v-for="round in detail.rounds" :key="round.id" class="block">
      <template #header>第 {{ round.roundNo }} 把 · {{ round.status }} {{ round.kind }}</template>
      <div v-for="(line, index) in round.lines" :key="index">{{ line }}</div>
      <el-table :data="round.deltas" size="small" style="margin-top: 8px">
        <el-table-column prop="nickname" label="玩家" />
        <el-table-column prop="delta" label="净分" />
      </el-table>
      <el-collapse style="margin-top: 8px">
        <el-collapse-item title="申报明细">
          <pre v-for="report in round.reports" :key="report.userId">{{ report.nickname }} {{ report.payload }}</pre>
        </el-collapse-item>
      </el-collapse>
    </el-card>
    <el-card class="block">
      <template #header>弹幕</template>
      <div v-for="item in detail.danmaku" :key="item.id" class="line">{{ item.nickname }}：{{ item.content }}</div>
      <div v-if="!detail.danmaku.length">没有弹幕</div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import http from '../api'

const route = useRoute()
const detail = ref(null)

onMounted(async () => {
  detail.value = await http.get('/matches/' + route.params.id)
})
</script>

<style scoped>
.block { margin-top: 12px; }
.line { padding: 4px 0; }
pre { white-space: pre-wrap; font-size: 12px; }
</style>
