<template>
  <el-card>
    <el-select v-model="status" clearable placeholder="全部状态" style="width: 160px" @change="load">
      <el-option label="等待" value="waiting" />
      <el-option label="进行中" value="playing" />
      <el-option label="已结束" value="ended" />
    </el-select>
    <el-table :data="items" style="margin-top: 12px" @row-click="open">
      <el-table-column prop="code" label="房间" />
      <el-table-column prop="hostName" label="房主" />
      <el-table-column prop="status" label="状态" />
      <el-table-column prop="createdAt" label="创建" />
      <el-table-column prop="endedAt" label="结束" />
    </el-table>
    <el-pagination style="margin-top: 12px" layout="prev, pager, next" :total="total" :page-size="20" @current-change="onPage" />
  </el-card>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import http from '../api'

const router = useRouter()
const status = ref('')
const items = ref([])
const total = ref(0)
const page = ref(1)

async function load() {
  const body = await http.get('/matches', { params: { status: status.value, page: page.value, pageSize: 20 } })
  items.value = body.items
  total.value = body.total
}

function onPage(value) {
  page.value = value
  load()
}

function open(row) {
  router.push('/matches/' + row.id)
}

onMounted(load)
</script>
