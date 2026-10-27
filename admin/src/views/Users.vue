<template>
  <el-card>
    <el-input v-model="keyword" placeholder="昵称或 openid" style="width: 240px" @change="load" />
    <el-table :data="items" style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="nickname" label="昵称" />
      <el-table-column prop="openid" label="OpenID" />
      <el-table-column prop="lastLoginAt" label="最近登录" />
      <el-table-column prop="createdAt" label="创建时间" />
    </el-table>
    <el-pagination
      style="margin-top: 12px"
      layout="prev, pager, next"
      :total="total"
      :page-size="20"
      @current-change="onPage"
    />
  </el-card>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import http from '../api'

const keyword = ref('')
const items = ref([])
const total = ref(0)
const page = ref(1)

async function load() {
  const body = await http.get('/users', { params: { keyword: keyword.value, page: page.value, pageSize: 20 } })
  items.value = body.items
  total.value = body.total
}

function onPage(value) {
  page.value = value
  load()
}

onMounted(load)
</script>
