package com.instapay.android.ui

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.instapay.android.R
import com.instapay.android.data.LogItem

class LogAdapter(private val items: List<LogItem>) :
    RecyclerView.Adapter<LogAdapter.LogViewHolder>() {

    class LogViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvTimestamp: TextView = itemView.findViewById(R.id.tvTimestamp)
        val tvTag: TextView = itemView.findViewById(R.id.tvTag)
        val tvMessage: TextView = itemView.findViewById(R.id.tvMessage)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LogViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_log, parent, false)
        return LogViewHolder(view)
    }

    override fun onBindViewHolder(holder: LogViewHolder, position: Int) {
        val item = items[position]
        holder.tvTimestamp.text = item.timestamp
        holder.tvTag.text = "[${item.tag}]"
        holder.tvMessage.text = item.message

        if (item.isError) {
            holder.tvMessage.setTextColor(Color.parseColor("#EF4444"))
            holder.tvTag.setTextColor(Color.parseColor("#EF4444"))
        } else {
            holder.tvMessage.setTextColor(Color.parseColor("#E2E8F0"))
            when (item.tag) {
                "INTERCEPT" -> holder.tvTag.setTextColor(Color.parseColor("#F59E0B"))
                "PIN" -> holder.tvTag.setTextColor(Color.parseColor("#10B981"))
                "SMS" -> holder.tvTag.setTextColor(Color.parseColor("#A855F7"))
                else -> holder.tvTag.setTextColor(Color.parseColor("#38BDF8"))
            }
        }
    }

    override fun getItemCount(): Int = items.size
}
