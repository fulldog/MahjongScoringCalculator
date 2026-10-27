<template>
  <div class="login">
    <el-card class="card">
      <h1>捉鸡记账后台</h1>
      <el-form @submit.prevent="submit">
        <el-form-item>
          <el-input v-model="username" placeholder="账号" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码" show-password />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="busy" style="width: 100%">登录</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '../api'

const router = useRouter()
const username = ref('admin')
const password = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  try {
    const body = await http.post('/login', { username: username.value, password: password.value })
    localStorage.setItem('admin-token', body.token)
    router.push('/')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #14120e; }
.card { width: 360px; }
h1 { margin: 0 0 18px; font-size: 20px; }
</style>
