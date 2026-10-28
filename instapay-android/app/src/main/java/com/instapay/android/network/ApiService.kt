package com.instapay.android.network

import com.instapay.android.data.HeartbeatPayload
import com.instapay.android.data.IncomingSmsPayload
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ApiService {

    @POST("/api/sms/incoming")
    fun sendIncomingSms(@Body payload: IncomingSmsPayload): Call<ResponseBody>

    @POST("/api/gateway/heartbeat")
    fun sendHeartbeat(@Body payload: HeartbeatPayload): Call<ResponseBody>

    @GET("/health")
    fun checkHealth(): Call<ResponseBody>
}
